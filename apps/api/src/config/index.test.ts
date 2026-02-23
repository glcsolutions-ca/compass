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
  });

  it("parses postgres settings when provided", () => {
    const config = loadApiConfig({
      DATABASE_URL: "postgres://compass:compass@localhost:5432/compass",
      DB_POOL_MAX: "25",
      DB_IDLE_TIMEOUT_MS: "15000",
      DB_CONNECTION_TIMEOUT_MS: "4000",
      DB_SSL_MODE: "require",
      DB_SSL_REJECT_UNAUTHORIZED: "false",
      LOG_LEVEL: "warn"
    });

    expect(config.databaseUrl).toBe("postgres://compass:compass@localhost:5432/compass");
    expect(config.dbPoolMax).toBe(25);
    expect(config.dbIdleTimeoutMs).toBe(15_000);
    expect(config.dbConnectionTimeoutMs).toBe(4_000);
    expect(config.dbSslMode).toBe("require");
    expect(config.dbSslRejectUnauthorized).toBe(false);
    expect(config.logLevel).toBe("warn");
  });

  it("rejects invalid DB_SSL_MODE", () => {
    expect(() =>
      loadApiConfig({
        DB_SSL_MODE: "enabled"
      })
    ).toThrow();
  });

  it("rejects invalid DB_POOL_MAX", () => {
    expect(() =>
      loadApiConfig({
        DB_POOL_MAX: "0"
      })
    ).toThrow();
  });
});
