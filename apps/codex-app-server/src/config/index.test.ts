import { describe, expect, it } from "vitest";
import { loadCodexAppConfig } from "./index.js";

describe("loadCodexAppConfig", () => {
  it("applies defaults", () => {
    const config = loadCodexAppConfig({});

    expect(config.port).toBe(3010);
    expect(config.host).toBe("0.0.0.0");
    expect(config.codexBinPath).toBe("codex");
    expect(config.clientName).toBe("compass_codex_gateway");
    expect(config.startOnBoot).toBe(true);
    expect(config.entraAllowedTenantIds).toEqual([]);
    expect(config.entraLoginEnabled).toBe(false);
    expect(config.authDevFallbackEnabled).toBe(false);
  });

  it("parses env overrides", () => {
    const config = loadCodexAppConfig({
      CODEX_PORT: "3456",
      CODEX_HOST: "127.0.0.1",
      CODEX_BIN_PATH: "/tmp/codex",
      CODEX_HOME: "/tmp/codex-home",
      CODEX_START_ON_BOOT: "false",
      OPENAI_API_KEY: "sk-test",
      ENTRA_CLIENT_ID: "client-id",
      ENTRA_CLIENT_SECRET: "client-secret",
      ENTRA_REDIRECT_URI: "https://example.com/callback",
      ENTRA_ALLOWED_TENANT_IDS: "tenant-a,tenant-b",
      ENTRA_LOGIN_ENABLED: "true",
      AUTH_DEV_FALLBACK_ENABLED: "true"
    });

    expect(config.port).toBe(3456);
    expect(config.host).toBe("127.0.0.1");
    expect(config.codexBinPath).toBe("/tmp/codex");
    expect(config.codexHome).toBe("/tmp/codex-home");
    expect(config.startOnBoot).toBe(false);
    expect(config.serviceApiKey).toBe("sk-test");
    expect(config.entraClientId).toBe("client-id");
    expect(config.entraClientSecret).toBe("client-secret");
    expect(config.entraRedirectUri).toBe("https://example.com/callback");
    expect(config.entraAllowedTenantIds).toEqual(["tenant-a", "tenant-b"]);
    expect(config.entraLoginEnabled).toBe(true);
    expect(config.authDevFallbackEnabled).toBe(true);
  });

  it("treats blank optional env values as unset", () => {
    const config = loadCodexAppConfig({
      DATABASE_URL: " ",
      OPENAI_API_KEY: "",
      ENTRA_CLIENT_ID: "   ",
      ENTRA_CLIENT_SECRET: "",
      ENTRA_REDIRECT_URI: " "
    });

    expect(config.databaseUrl).toBeUndefined();
    expect(config.serviceApiKey).toBeUndefined();
    expect(config.entraClientId).toBeUndefined();
    expect(config.entraClientSecret).toBeUndefined();
    expect(config.entraRedirectUri).toBeUndefined();
  });
});
