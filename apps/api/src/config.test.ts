import { describe, expect, it } from "vitest";
import { loadApiConfig } from "./config.js";

describe("loadApiConfig", () => {
  it("uses baseline defaults", () => {
    const config = loadApiConfig({});
    expect(config).toEqual({
      host: "0.0.0.0",
      port: 3001,
      logLevel: "info",
      databaseUrl: undefined,
      authMode: "mock"
    });
  });

  it("reads and trims configured values", () => {
    const config = loadApiConfig({
      API_HOST: " 127.0.0.1 ",
      API_PORT: "4001",
      LOG_LEVEL: " DEBUG "
    });

    expect(config).toEqual({
      host: "127.0.0.1",
      port: 4001,
      logLevel: "debug",
      databaseUrl: undefined,
      authMode: "mock"
    });
  });

  it("uses defaults when configured values are blank", () => {
    const config = loadApiConfig({
      API_HOST: " ",
      API_PORT: " ",
      LOG_LEVEL: " "
    });

    expect(config).toEqual({
      host: "0.0.0.0",
      port: 3001,
      logLevel: "info",
      databaseUrl: undefined,
      authMode: "mock"
    });
  });

  it("uses DATABASE_URL when configured", () => {
    const config = loadApiConfig({
      DATABASE_URL: " postgres://user:pass@localhost:5432/compass "
    });

    expect(config.databaseUrl).toBe("postgres://user:pass@localhost:5432/compass");
  });

  it("parses AUTH_MODE when configured", () => {
    expect(loadApiConfig({ AUTH_MODE: "entra" }).authMode).toBe("entra");
    expect(loadApiConfig({ AUTH_MODE: " mock " }).authMode).toBe("mock");
  });

  it("rejects invalid API ports", () => {
    expect(() => loadApiConfig({ API_PORT: "0" })).toThrow("Invalid API_PORT: 0");
    expect(() => loadApiConfig({ API_PORT: "70000" })).toThrow("Invalid API_PORT: 70000");
    expect(() => loadApiConfig({ API_PORT: "NaN" })).toThrow("Invalid API_PORT: NaN");
    expect(() => loadApiConfig({ API_PORT: "1e3" })).toThrow("Invalid API_PORT: 1e3");
    expect(() => loadApiConfig({ API_PORT: "0x10" })).toThrow("Invalid API_PORT: 0x10");
    expect(() => loadApiConfig({ API_PORT: "3001abc" })).toThrow("Invalid API_PORT: 3001abc");
  });

  it("rejects invalid AUTH_MODE", () => {
    expect(() => loadApiConfig({ AUTH_MODE: "legacy" })).toThrow("Invalid AUTH_MODE: legacy");
  });
});
