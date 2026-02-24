import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { AuthError } from "./errors.js";
import { AccessTokenVerifier } from "./token-verifier.js";
import type { ApiConfig } from "../config/index.js";

const config: ApiConfig = {
  nodeEnv: "test",
  databaseUrl: undefined,
  dbPoolMax: 10,
  dbIdleTimeoutMs: 10_000,
  dbConnectionTimeoutMs: 2_000,
  dbSslMode: "disable",
  dbSslRejectUnauthorized: true,
  logLevel: "silent",
  host: "127.0.0.1",
  port: 3001,
  authIssuer: "https://compass.local/auth",
  authAudience: "api://compass-api",
  authJwksUri: undefined,
  authLocalJwtSecret: "compass-dev-local-jwt-secret",
  authClockToleranceSeconds: 60,
  authAllowedClientIds: ["web-client", "integration-client", "scim-client"],
  authActiveTenantIds: ["tenant-a"],
  authAllowJitUsers: true,
  authAssignments: [],
  scimClients: [],
  oauthTokenIssuer: "https://compass.local/oauth",
  oauthTokenAudience: "compass-scim",
  oauthTokenSigningSecret: "compass-dev-scim-signing-secret",
  oauthTokenExpiresInSeconds: 3600
};

async function signApiToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.authIssuer)
    .setAudience(config.authAudience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(config.authLocalJwtSecret));
}

async function signScimToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(config.oauthTokenIssuer)
    .setAudience(config.oauthTokenAudience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(config.oauthTokenSigningSecret));
}

async function expectAuthError(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected promise to throw AuthError");
  } catch (error) {
    if (error instanceof AuthError) {
      return error;
    }

    throw error;
  }
}

describe("AccessTokenVerifier", () => {
  it("classifies delegated tokens when scope claim is present", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signApiToken({
      tid: "tenant-a",
      oid: "user-oid-1",
      azp: "web-client",
      scp: "compass.user compass.admin"
    });

    const result = await verifier.verifyAuthorizationHeader(`Bearer ${token}`);
    expect(result.tokenType).toBe("delegated");
    expect(result.subjectType).toBe("user");
    expect(result.subjectId).toBe("user-oid-1");
    expect(result.scopes.has("compass.user")).toBe(true);
  });

  it("classifies app tokens when role claim is present", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signApiToken({
      tid: "tenant-a",
      azp: "integration-client",
      appid: "integration-client",
      idtyp: "app",
      roles: ["Compass.Integration.Read"]
    });

    const result = await verifier.verifyAuthorizationHeader(`Bearer ${token}`);
    expect(result.tokenType).toBe("app");
    expect(result.subjectType).toBe("app");
    expect(result.subjectId).toBe("integration-client");
    expect(result.appRoles.has("Compass.Integration.Read")).toBe(true);
  });

  it("rejects tokens that cannot be unambiguously classified", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signApiToken({
      tid: "tenant-a",
      oid: "user-oid-1",
      azp: "web-client",
      scp: "compass.user",
      roles: ["Compass.Integration.Read"]
    });

    const error = await expectAuthError(verifier.verifyAuthorizationHeader(`Bearer ${token}`));
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("token_unclassified");
  });

  it("rejects tokens with no delegated scopes and no app roles", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signApiToken({
      tid: "tenant-a",
      oid: "user-oid-1",
      azp: "web-client"
    });

    const error = await expectAuthError(verifier.verifyAuthorizationHeader(`Bearer ${token}`));
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("token_unclassified");
  });

  it("rejects non-allowlisted actor clients", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signApiToken({
      tid: "tenant-a",
      oid: "user-oid-1",
      azp: "rogue-client",
      scp: "compass.user"
    });

    const error = await expectAuthError(verifier.verifyAuthorizationHeader(`Bearer ${token}`));
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("invalid_token");
  });

  it("rejects app tokens when idtyp claim is not app", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signApiToken({
      tid: "tenant-a",
      azp: "integration-client",
      appid: "integration-client",
      idtyp: "user",
      roles: ["Compass.Integration.Read"]
    });

    const error = await expectAuthError(verifier.verifyAuthorizationHeader(`Bearer ${token}`));
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("invalid_token");
    expect(error.message).toBe("App token idtyp claim must be app");
  });

  it("accepts SCIM app token with provisioning role", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signScimToken({
      tid: "tenant-a",
      azp: "scim-client",
      appid: "scim-client",
      idtyp: "app",
      roles: ["scim.provisioner"]
    });

    const scim = await verifier.verifyScimAuthorizationHeader(`Bearer ${token}`);
    expect(scim.tenantId).toBe("tenant-a");
    expect(scim.clientId).toBe("scim-client");
  });

  it("rejects SCIM tokens without app marker or provisioning authorization", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signScimToken({
      tid: "tenant-a",
      azp: "scim-client",
      appid: "scim-client",
      idtyp: "user",
      roles: ["scim.reader"]
    });

    const error = await expectAuthError(verifier.verifyScimAuthorizationHeader(`Bearer ${token}`));
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe("invalid_token");
  });

  it("rejects SCIM tokens missing provisioning role and scope", async () => {
    const verifier = new AccessTokenVerifier(config);
    const token = await signScimToken({
      tid: "tenant-a",
      azp: "scim-client",
      appid: "scim-client",
      idtyp: "app",
      roles: ["scim.reader"]
    });

    const error = await expectAuthError(verifier.verifyScimAuthorizationHeader(`Bearer ${token}`));
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("permission_denied");
  });
});
