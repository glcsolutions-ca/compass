import { describe, expect, it } from "vitest";
import { loadApiConfig } from "./index.js";

describe("loadApiConfig", () => {
  it("uses defaults when environment variables are not provided", () => {
    const config = loadApiConfig({});

    expect(config.nodeEnv).toBe("development");
    expect(config.databaseUrl).toBeUndefined();
    expect(config.port).toBe(3001);
    expect(config.host).toBe("0.0.0.0");
    expect(config.logLevel).toBe("info");
    expect(config.dbPoolMax).toBe(10);
    expect(config.dbIdleTimeoutMs).toBe(10_000);
    expect(config.dbConnectionTimeoutMs).toBe(2_000);
    expect(config.dbSslMode).toBe("disable");
    expect(config.dbSslRejectUnauthorized).toBe(true);
    expect(config.authIssuer).toBe("https://compass.local/auth");
    expect(config.authAudience).toBe("api://compass-api");
    expect(config.authLocalJwtSecret).toBe("compass-dev-local-jwt-secret");
    expect(config.authAllowedClientIds).toEqual([]);
    expect(config.authActiveTenantIds).toEqual([]);
    expect(config.authAssignments).toEqual([]);
    expect(config.scimClients).toEqual([]);
    expect(config.oauthTokenIssuer).toBe("https://compass.local/oauth");
    expect(config.oauthTokenAudience).toBe("compass-scim");
    expect(config.oauthTokenSigningSecret).toBe("compass-dev-scim-signing-secret");
  });

  it("parses auth and postgres settings when provided", () => {
    const config = loadApiConfig({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://compass:compass@localhost:5432/compass",
      DB_POOL_MAX: "25",
      DB_IDLE_TIMEOUT_MS: "15000",
      DB_CONNECTION_TIMEOUT_MS: "4000",
      DB_SSL_MODE: "require",
      DB_SSL_REJECT_UNAUTHORIZED: "false",
      LOG_LEVEL: "warn",
      AUTH_ISSUER: "https://login.microsoftonline.com/test/v2.0",
      AUTH_AUDIENCE: "api://compass-api",
      AUTH_JWKS_URI: "https://login.microsoftonline.com/test/discovery/v2.0/keys",
      AUTH_LOCAL_JWT_SECRET: "local-testing-secret-123",
      AUTH_ALLOWED_CLIENT_IDS: "client-a, client-b",
      AUTH_ACTIVE_TENANT_IDS: "tenant-a,tenant-b",
      AUTH_ALLOW_JIT_USERS: "false",
      AUTH_ASSIGNMENTS_JSON:
        '[{"tenantId":"tenant-a","subjectType":"user","subjectId":"oid-1","permissions":["profile.read"]}]',
      AUTH_SCIM_CLIENTS_JSON:
        '[{"tenantId":"tenant-a","clientId":"scim-client","clientSecret":"scim-secret-123456"}]',
      OAUTH_TOKEN_ISSUER: "https://compass.example.com/oauth",
      OAUTH_TOKEN_AUDIENCE: "compass-scim",
      OAUTH_TOKEN_SIGNING_SECRET: "oauth-signing-secret-123456",
      OAUTH_TOKEN_EXPIRES_IN_SECONDS: "900"
    });

    expect(config.databaseUrl).toBe("postgres://compass:compass@localhost:5432/compass");
    expect(config.dbPoolMax).toBe(25);
    expect(config.dbIdleTimeoutMs).toBe(15_000);
    expect(config.dbConnectionTimeoutMs).toBe(4_000);
    expect(config.dbSslMode).toBe("require");
    expect(config.dbSslRejectUnauthorized).toBe(false);
    expect(config.logLevel).toBe("warn");
    expect(config.authIssuer).toBe("https://login.microsoftonline.com/test/v2.0");
    expect(config.authJwksUri).toBe("https://login.microsoftonline.com/test/discovery/v2.0/keys");
    expect(config.authAllowedClientIds).toEqual(["client-a", "client-b"]);
    expect(config.authActiveTenantIds).toEqual(["tenant-a", "tenant-b"]);
    expect(config.authAllowJitUsers).toBe(false);
    expect(config.authAssignments).toEqual([
      {
        tenantId: "tenant-a",
        subjectType: "user",
        subjectId: "oid-1",
        permissions: ["profile.read"]
      }
    ]);
    expect(config.scimClients[0]?.clientId).toBe("scim-client");
    expect(config.oauthTokenExpiresInSeconds).toBe(900);
  });

  it("rejects invalid DB_SSL_MODE", () => {
    expect(() =>
      loadApiConfig({
        DB_SSL_MODE: "enabled"
      })
    ).toThrow();
  });

  it("rejects invalid AUTH_ASSIGNMENTS_JSON payload", () => {
    expect(() =>
      loadApiConfig({
        AUTH_ASSIGNMENTS_JSON: '{"tenantId":"missing-array"}'
      })
    ).toThrow(/AUTH_ASSIGNMENTS_JSON/);
  });
});
