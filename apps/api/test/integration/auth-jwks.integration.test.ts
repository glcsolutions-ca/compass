import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "pg";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { buildApiApp } from "../../src/app.js";
import { loadApiConfig } from "../../src/config/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const TENANT_ID = "jwks-tenant";
const AUTH_ISSUER = "https://login.microsoftonline.com/jwks-tenant/v2.0";
const AUTH_AUDIENCE = "api://compass-api";
const DELEGATED_CLIENT_ID = "web-client";
const APP_CLIENT_ID = "integration-client";
const UNASSIGNED_CLIENT_ID = "unassigned-client";
const USER_OID = "jwks-smoke-user-oid";

const roleUserId = `role_jwks_user_${TENANT_ID}`;
const roleAppId = `role_jwks_app_${TENANT_ID}`;
const principalUserId = `principal_jwks_user_${TENANT_ID}`;
const principalAppId = `principal_jwks_app_${TENANT_ID}`;

async function generateSigningKey(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  return {
    kid,
    privateKey,
    publicJwk: {
      ...jwk,
      kid,
      alg: "RS256",
      use: "sig"
    }
  };
}

async function signToken({
  signer,
  claims,
  issuer = AUTH_ISSUER,
  audience = AUTH_AUDIENCE
}: {
  signer: { kid: string; privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"] };
  claims: Record<string, unknown>;
  issuer?: string;
  audience?: string;
}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: signer.kid })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(signer.privateKey);
}

function buildAuthConfig(authJwksUri: string) {
  return loadApiConfig({
    NODE_ENV: "production",
    LOG_LEVEL: "silent",
    DATABASE_URL: databaseUrl,
    DB_SSL_MODE: "disable",
    AUTH_ISSUER: AUTH_ISSUER,
    AUTH_AUDIENCE: AUTH_AUDIENCE,
    AUTH_JWKS_URI: authJwksUri,
    AUTH_ALLOWED_CLIENT_IDS: `${DELEGATED_CLIENT_ID},${APP_CLIENT_ID},${UNASSIGNED_CLIENT_ID}`,
    AUTH_ALLOW_JIT_USERS: "false",
    OAUTH_TOKEN_SIGNING_SECRET: "jwks-oauth-signing-secret-123456"
  });
}

async function ensureAuthBootstrapRows(client: Client) {
  await client.query(
    `
      INSERT INTO tenants (id, name, status, safelist_status, onboarding_mode, approved_at, created_at, updated_at)
      VALUES ($1, 'JWKS Integration Tenant', 'active', 'approved', 'hybrid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status,
          safelist_status = EXCLUDED.safelist_status,
          onboarding_mode = EXCLUDED.onboarding_mode,
          approved_at = EXCLUDED.approved_at,
          updated_at = CURRENT_TIMESTAMP
    `,
    [TENANT_ID]
  );

  await client.query(
    `
      INSERT INTO permissions (id, description, created_at)
      VALUES ('profile.read', 'Read authenticated principal profile', CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING
    `
  );

  await client.query(
    `
      INSERT INTO roles (id, tenant_id, name, description, is_system, created_at, updated_at)
      VALUES
        ($1, $3, 'JWKS User Role', 'Delegated role for JWKS integration tests', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($2, $3, 'JWKS App Role', 'App role for JWKS integration tests', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          is_system = EXCLUDED.is_system,
          updated_at = CURRENT_TIMESTAMP
    `,
    [roleUserId, roleAppId, TENANT_ID]
  );

  await client.query(
    `
      INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_at)
      VALUES
        ($1, $2, 'profile.read', CURRENT_TIMESTAMP),
        ($1, $3, 'profile.read', CURRENT_TIMESTAMP)
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `,
    [TENANT_ID, roleUserId, roleAppId]
  );

  await client.query(
    `
      INSERT INTO principals (id, tenant_id, principal_type, display_name, status, created_at, updated_at)
      VALUES
        ($1, $3, 'user', 'JWKS Smoke User', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ($2, $3, 'app', 'JWKS Smoke App', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          principal_type = EXCLUDED.principal_type,
          display_name = EXCLUDED.display_name,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
    `,
    [principalUserId, principalAppId, TENANT_ID]
  );

  await client.query(
    `
      INSERT INTO identities (id, tenant_id, principal_id, provider, subject, object_id, app_id, claims, created_at, updated_at)
      VALUES
        (
          $1::text,
          $3::text,
          $5::text,
          'entra-user',
          $2::text,
          $2::text,
          NULL,
          jsonb_build_object('tid', $3::text, 'oid', $2::text),
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        ),
        (
          $4::text,
          $3::text,
          $6::text,
          'entra-app',
          $7::text,
          NULL,
          $7::text,
          jsonb_build_object('tid', $3::text, 'appid', $7::text),
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      ON CONFLICT (tenant_id, provider, subject) DO UPDATE
      SET principal_id = EXCLUDED.principal_id,
          object_id = EXCLUDED.object_id,
          app_id = EXCLUDED.app_id,
          claims = EXCLUDED.claims,
          updated_at = CURRENT_TIMESTAMP
    `,
    [
      `identity_jwks_user_${TENANT_ID}`,
      USER_OID,
      TENANT_ID,
      `identity_jwks_app_${TENANT_ID}`,
      principalUserId,
      principalAppId,
      APP_CLIENT_ID
    ]
  );

  await client.query(
    `
      INSERT INTO principal_role_bindings (id, tenant_id, principal_id, role_id, source, created_at)
      VALUES
        ($1, $5, $3, $7, 'direct', CURRENT_TIMESTAMP),
        ($2, $5, $4, $6, 'direct', CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE
      SET tenant_id = EXCLUDED.tenant_id,
          principal_id = EXCLUDED.principal_id,
          role_id = EXCLUDED.role_id,
          source = EXCLUDED.source
    `,
    [
      `binding_jwks_user_${TENANT_ID}`,
      `binding_jwks_app_${TENANT_ID}`,
      principalUserId,
      principalAppId,
      TENANT_ID,
      roleAppId,
      roleUserId
    ]
  );
}

describe("Auth integration with remote JWKS", () => {
  const db = new Client({ connectionString: databaseUrl });
  let app: ReturnType<typeof buildApiApp> | null = null;
  let jwksServer: ReturnType<typeof createServer> | undefined = undefined;
  let jwksUri = "";
  let publishedKeys: Array<Record<string, unknown>> = [];

  let oldSigner: Awaited<ReturnType<typeof generateSigningKey>>;
  let newSigner: Awaited<ReturnType<typeof generateSigningKey>>;
  let unknownSigner: Awaited<ReturnType<typeof generateSigningKey>>;

  async function startApi() {
    const config = buildAuthConfig(jwksUri);
    app = buildApiApp({ config });
    await app.ready();
  }

  async function restartApi() {
    if (app) {
      await app.close();
    }
    await startApi();
  }

  async function requestMe(token: string) {
    if (!app) {
      throw new Error("API app is not initialized");
    }

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${token}` }
    });

    return {
      statusCode: response.statusCode,
      json: response.json() as { code?: string; caller?: { tokenType?: string } }
    };
  }

  beforeAll(async () => {
    await db.connect();
    await ensureAuthBootstrapRows(db);

    oldSigner = await generateSigningKey("jwks-old");
    newSigner = await generateSigningKey("jwks-new");
    unknownSigner = await generateSigningKey("jwks-unknown");
    publishedKeys = [oldSigner.publicJwk];

    jwksServer = createServer((request, response) => {
      if (request.url !== "/jwks") {
        response.writeHead(404);
        response.end();
        return;
      }

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ keys: publishedKeys }));
    });

    await new Promise<void>((resolve) => {
      jwksServer?.listen(0, "127.0.0.1", () => resolve());
    });

    const address = jwksServer.address() as AddressInfo;
    jwksUri = `http://127.0.0.1:${address.port}/jwks`;
    await startApi();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await db.end();
    if (jwksServer) {
      await new Promise<void>((resolve, reject) => {
        jwksServer?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("accepts delegated and app tokens from remote JWKS", async () => {
    const delegatedToken = await signToken({
      signer: oldSigner,
      claims: {
        tid: TENANT_ID,
        oid: USER_OID,
        azp: DELEGATED_CLIENT_ID,
        scp: "compass.user"
      }
    });
    const delegatedMe = await requestMe(delegatedToken);
    expect(delegatedMe.statusCode).toBe(200);
    expect(delegatedMe.json.caller?.tokenType).toBe("delegated");

    const appToken = await signToken({
      signer: oldSigner,
      claims: {
        tid: TENANT_ID,
        azp: APP_CLIENT_ID,
        appid: APP_CLIENT_ID,
        idtyp: "app",
        roles: ["Compass.Integration.Read"]
      }
    });
    const appMe = await requestMe(appToken);
    expect(appMe.statusCode).toBe(200);
    expect(appMe.json.caller?.tokenType).toBe("app");
  });

  it("rejects tokens with bad issuer, bad audience, and unknown key id", async () => {
    const badIssuerToken = await signToken({
      signer: oldSigner,
      issuer: "https://login.microsoftonline.com/not-allowed/v2.0",
      claims: {
        tid: TENANT_ID,
        oid: USER_OID,
        azp: DELEGATED_CLIENT_ID,
        scp: "compass.user"
      }
    });
    const badIssuerMe = await requestMe(badIssuerToken);
    expect(badIssuerMe.statusCode).toBe(401);
    expect(badIssuerMe.json.code).toBe("invalid_token");

    const badAudienceToken = await signToken({
      signer: oldSigner,
      audience: "api://wrong-audience",
      claims: {
        tid: TENANT_ID,
        oid: USER_OID,
        azp: DELEGATED_CLIENT_ID,
        scp: "compass.user"
      }
    });
    const badAudienceMe = await requestMe(badAudienceToken);
    expect(badAudienceMe.statusCode).toBe(401);
    expect(badAudienceMe.json.code).toBe("invalid_token");

    const unknownKidToken = await signToken({
      signer: unknownSigner,
      claims: {
        tid: TENANT_ID,
        oid: USER_OID,
        azp: DELEGATED_CLIENT_ID,
        scp: "compass.user"
      }
    });
    const unknownKidMe = await requestMe(unknownKidToken);
    expect(unknownKidMe.statusCode).toBe(401);
    expect(unknownKidMe.json.code).toBe("invalid_token");
  });

  it("rejects disallowed client and unassigned principal", async () => {
    const disallowedClientToken = await signToken({
      signer: oldSigner,
      claims: {
        tid: TENANT_ID,
        oid: USER_OID,
        azp: "rogue-client",
        scp: "compass.user"
      }
    });
    const disallowedClientMe = await requestMe(disallowedClientToken);
    expect(disallowedClientMe.statusCode).toBe(401);
    expect(disallowedClientMe.json.code).toBe("invalid_token");

    const unassignedAppToken = await signToken({
      signer: oldSigner,
      claims: {
        tid: TENANT_ID,
        azp: UNASSIGNED_CLIENT_ID,
        appid: UNASSIGNED_CLIENT_ID,
        idtyp: "app",
        roles: ["Compass.Integration.Read"]
      }
    });
    const unassignedAppMe = await requestMe(unassignedAppToken);
    expect(unassignedAppMe.statusCode).toBe(403);
    expect(unassignedAppMe.json.code).toBe("assignment_denied");
  });

  it("handles JWKS key rollover with old/new key behavior", async () => {
    const oldToken = await signToken({
      signer: oldSigner,
      claims: {
        tid: TENANT_ID,
        oid: USER_OID,
        azp: DELEGATED_CLIENT_ID,
        scp: "compass.user"
      }
    });
    const oldBeforeRollover = await requestMe(oldToken);
    expect(oldBeforeRollover.statusCode).toBe(200);

    // During rollout window, publish both old and new keys.
    publishedKeys = [oldSigner.publicJwk, newSigner.publicJwk];
    await restartApi();

    const newDuringRollover = await signToken({
      signer: newSigner,
      claims: {
        tid: TENANT_ID,
        oid: USER_OID,
        azp: DELEGATED_CLIENT_ID,
        scp: "compass.user"
      }
    });
    const newDuringRolloverMe = await requestMe(newDuringRollover);
    expect(newDuringRolloverMe.statusCode).toBe(200);

    // After cutover, publish only the new key and restart verifier context.
    publishedKeys = [newSigner.publicJwk];
    await restartApi();

    const oldAfterCutover = await requestMe(oldToken);
    expect(oldAfterCutover.statusCode).toBe(401);
    expect(oldAfterCutover.json.code).toBe("invalid_token");

    const newAfterCutoverMe = await requestMe(newDuringRollover);
    expect(newAfterCutoverMe.statusCode).toBe(200);
    expect(newAfterCutoverMe.json.caller?.tokenType).toBe("delegated");
  });
});
