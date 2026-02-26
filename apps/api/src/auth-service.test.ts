import { describe, expect, it } from "vitest";
import { buildEntraAuthConfig, readSessionTokenFromCookie } from "./auth-service.js";

describe("buildEntraAuthConfig", () => {
  it("uses organizations defaults and empty allow-list", () => {
    const config = buildEntraAuthConfig({
      WEB_BASE_URL: "https://compass.glcsolutions.ca"
    });

    expect(config.tenantSegment).toBe("organizations");
    expect(config.allowedTenantIds).toEqual([]);
    expect(config.redirectUri).toBe("https://compass.glcsolutions.ca/v1/auth/entra/callback");
    expect(config.oidcStateEncryptionKey).toBeUndefined();
  });

  it("parses comma-separated allow-list values", () => {
    const config = buildEntraAuthConfig({
      ENTRA_ALLOWED_TENANT_IDS:
        " 11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222 ,,",
      WEB_BASE_URL: "https://compass.glcsolutions.ca"
    });

    expect(config.allowedTenantIds).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222"
    ]);
  });

  it("reads OIDC state encryption key from environment", () => {
    const config = buildEntraAuthConfig({
      AUTH_OIDC_STATE_ENCRYPTION_KEY: "  AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA ",
      WEB_BASE_URL: "https://compass.glcsolutions.ca"
    });

    expect(config.oidcStateEncryptionKey).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  });
});

describe("readSessionTokenFromCookie", () => {
  it("extracts __Host-compass_session cookie values", () => {
    const token = readSessionTokenFromCookie("foo=bar; __Host-compass_session=session-token; a=b");
    expect(token).toBe("session-token");
  });

  it("returns null when session cookie is missing", () => {
    const token = readSessionTokenFromCookie("foo=bar; a=b");
    expect(token).toBeNull();
  });
});
