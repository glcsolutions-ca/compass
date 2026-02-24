import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { HealthResponseSchema, OAuthTokenResponseSchema } from "@compass/contracts";
import { fixedClock } from "@compass/testkit";
import { buildApiApp } from "./app.js";

const testConfig = {
  nodeEnv: "test" as const,
  databaseUrl: undefined,
  dbPoolMax: 10,
  dbIdleTimeoutMs: 10_000,
  dbConnectionTimeoutMs: 2_000,
  dbSslMode: "disable" as const,
  dbSslRejectUnauthorized: true,
  logLevel: "silent" as const,
  host: "127.0.0.1",
  port: 3001,
  authIssuer: "https://compass.local/auth",
  authAudience: "api://compass-api",
  authJwksUri: undefined,
  authLocalJwtSecret: "compass-dev-local-jwt-secret",
  authClockToleranceSeconds: 60,
  authAllowedClientIds: ["web-client", "integration-client"],
  authActiveTenantIds: ["tenant-a"],
  authAllowJitUsers: true,
  authAssignments: [
    {
      tenantId: "tenant-a",
      subjectType: "user" as const,
      subjectId: "user-oid-1",
      permissions: ["profile.read"],
      principalId: "principal-user-1"
    },
    {
      tenantId: "tenant-a",
      subjectType: "user" as const,
      subjectId: "admin-oid-1",
      permissions: ["profile.read", "roles.read", "roles.write"],
      principalId: "principal-admin-1"
    },
    {
      tenantId: "tenant-a",
      subjectType: "app" as const,
      subjectId: "integration-client",
      permissions: ["profile.read", "roles.read"],
      principalId: "principal-app-1"
    }
  ],
  scimClients: [
    {
      tenantId: "tenant-a",
      clientId: "scim-client",
      clientSecret: "scim-client-secret-123456",
      scopes: ["scim.write"],
      roles: ["scim.provisioner"]
    }
  ],
  oauthTokenIssuer: "https://compass.local/oauth",
  oauthTokenAudience: "compass-scim",
  oauthTokenSigningSecret: "compass-dev-scim-signing-secret",
  oauthTokenExpiresInSeconds: 3600
};

async function signDelegatedToken(input: {
  oid: string;
  scopes: string;
  tenantId?: string;
  clientId?: string;
}) {
  const secret = new TextEncoder().encode(testConfig.authLocalJwtSecret);
  return new SignJWT({
    tid: input.tenantId ?? "tenant-a",
    oid: input.oid,
    azp: input.clientId ?? "web-client",
    scp: input.scopes,
    name: "Test User"
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(testConfig.authIssuer)
    .setAudience(testConfig.authAudience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

async function signAppToken(input: {
  roles: string[];
  tenantId?: string;
  clientId?: string;
  idtyp?: string;
}) {
  const secret = new TextEncoder().encode(testConfig.authLocalJwtSecret);
  const clientId = input.clientId ?? "integration-client";
  return new SignJWT({
    tid: input.tenantId ?? "tenant-a",
    azp: clientId,
    appid: clientId,
    idtyp: input.idtyp ?? "app",
    roles: input.roles
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(testConfig.authIssuer)
    .setAudience(testConfig.authAudience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

async function signMixedClaimsToken() {
  const secret = new TextEncoder().encode(testConfig.authLocalJwtSecret);
  return new SignJWT({
    tid: "tenant-a",
    oid: "user-oid-1",
    azp: "web-client",
    scp: "compass.user",
    roles: ["Compass.Integration.Read"]
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(testConfig.authIssuer)
    .setAudience(testConfig.authAudience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret);
}

describe("API", () => {
  it("returns health status", async () => {
    const now = fixedClock("2026-02-23T00:00:00.000Z");
    const app = buildApiApp({ config: testConfig, now });

    const response = await app.inject({ method: "GET", url: "/health" });
    const payload = HealthResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(payload).toEqual({
      status: "ok",
      timestamp: "2026-02-23T00:00:00.000Z"
    });

    await app.close();
  });

  it("registers postgres plugin when databaseUrl is provided", async () => {
    const app = buildApiApp({
      config: {
        ...testConfig,
        databaseUrl: "postgres://compass:compass@127.0.0.1:5432/compass"
      }
    });

    await app.ready();
    expect(app.hasDecorator("pg")).toBe(true);

    await app.close();
  });

  it("serves openapi document with system endpoint", async () => {
    const app = buildApiApp({ config: testConfig });

    const response = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(response.statusCode).toBe(200);
    expect(response.json().paths["/health"]).toBeDefined();
    expect(response.json().paths["/v1/me"]).toBeDefined();

    await app.close();
  });

  it("rejects protected endpoint when token is missing", async () => {
    const app = buildApiApp({ config: testConfig });
    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "invalid_token",
      message: "Missing Authorization header"
    });

    await app.close();
  });

  it("returns delegated caller context on authenticated request", async () => {
    const app = buildApiApp({ config: testConfig });
    const token = await signDelegatedToken({
      oid: "user-oid-1",
      scopes: "compass.user"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      caller: {
        tenantId: "tenant-a",
        tokenType: "delegated",
        subjectType: "user",
        subjectId: "user-oid-1",
        actorClientId: "web-client"
      }
    });

    await app.close();
  });

  it("returns app caller context on authenticated request", async () => {
    const app = buildApiApp({ config: testConfig });
    const token = await signAppToken({
      roles: ["Compass.Integration.Read"]
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      caller: {
        tenantId: "tenant-a",
        tokenType: "app",
        subjectType: "app",
        subjectId: "integration-client",
        actorClientId: "integration-client"
      }
    });

    await app.close();
  });

  it("accepts delegated tokens that include both scopes and roles", async () => {
    const app = buildApiApp({ config: testConfig });
    const token = await signMixedClaimsToken();

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      caller: {
        tenantId: "tenant-a",
        tokenType: "delegated",
        subjectType: "user",
        subjectId: "user-oid-1",
        actorClientId: "web-client"
      }
    });

    await app.close();
  });

  it("rejects non-allowlisted actor client", async () => {
    const app = buildApiApp({ config: testConfig });
    const token = await signDelegatedToken({
      oid: "user-oid-1",
      scopes: "compass.user",
      clientId: "rogue-client"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "invalid_token",
      message: "Client application is not allowlisted"
    });

    await app.close();
  });

  it("rejects unknown or inactive tenant", async () => {
    const app = buildApiApp({ config: testConfig });
    const token = await signDelegatedToken({
      oid: "admin-oid-1",
      scopes: "compass.admin",
      tenantId: "tenant-b"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "tenant_denied",
      message: "Tenant is not approved for access"
    });

    await app.close();
  });

  it("rejects principal without explicit assignment", async () => {
    const app = buildApiApp({ config: testConfig });
    const token = await signDelegatedToken({
      oid: "jit-unassigned-user",
      scopes: "compass.user"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "assignment_denied",
      message: "Principal is not assigned to any role"
    });

    await app.close();
  });

  it("rejects principal missing required permission", async () => {
    const app = buildApiApp({ config: testConfig });
    const token = await signDelegatedToken({
      oid: "user-oid-1",
      scopes: "compass.admin"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/tenants/tenant-a/roles",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "permission_denied",
      message: "Missing required permission: roles.read"
    });

    await app.close();
  });

  it("enforces tenant boundary on tenant-scoped routes", async () => {
    const app = buildApiApp({ config: testConfig });
    const token = await signDelegatedToken({
      oid: "admin-oid-1",
      scopes: "compass.admin"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/tenants/tenant-b/roles",
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: "tenant_denied",
      message: "Cross-tenant access is not allowed"
    });

    await app.close();
  });

  it("issues OAuth2 client-credentials token for SCIM and accepts provisioning call", async () => {
    const app = buildApiApp({ config: testConfig });
    const oauthResponse = await app.inject({
      method: "POST",
      url: "/v1/oauth/token",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      payload:
        "grant_type=client_credentials&client_id=scim-client&client_secret=scim-client-secret-123456"
    });

    expect(oauthResponse.statusCode).toBe(200);
    const oauthPayload = OAuthTokenResponseSchema.parse(oauthResponse.json());
    expect(oauthPayload.token_type).toBe("Bearer");
    expect(oauthPayload.access_token.length).toBeGreaterThan(20);

    const scimResponse = await app.inject({
      method: "POST",
      url: "/scim/v2/Users",
      headers: {
        authorization: `Bearer ${oauthPayload.access_token}`,
        "content-type": "application/json"
      },
      payload: {
        externalId: "entra-user-1",
        userName: "entra-user-1@example.com",
        displayName: "Entra User One",
        active: true
      }
    });

    expect(scimResponse.statusCode).toBe(200);
    expect(scimResponse.json()).toEqual({
      id: expect.any(String),
      externalId: "entra-user-1",
      active: true
    });

    await app.close();
  });

  it("rejects invalid OAuth2 client credentials", async () => {
    const app = buildApiApp({ config: testConfig });
    const response = await app.inject({
      method: "POST",
      url: "/v1/oauth/token",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      payload:
        "grant_type=client_credentials&client_id=scim-client&client_secret=wrong-secret-value"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: "invalid_token",
      message: "Invalid client credentials"
    });

    await app.close();
  });
});
