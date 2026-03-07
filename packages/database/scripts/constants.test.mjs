import { describe, expect, it } from "vitest";
import { resolveDatabaseUrl, resolveDatabaseUrlFromSources } from "./constants.mjs";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL from process env", () => {
    const resolved = resolveDatabaseUrl({
      env: { DATABASE_URL: "postgres://env:env@localhost:7777/env", POSTGRES_PORT: "6543" }
    });

    expect(resolved).toBe("postgres://env:env@localhost:7777/env");
  });

  it("builds DATABASE_URL from POSTGRES_PORT when DATABASE_URL is unset", () => {
    const resolved = resolveDatabaseUrl({
      env: { POSTGRES_PORT: "5544" }
    });

    expect(resolved).toBe("postgres://compass:compass@localhost:5544/compass");
  });

  it("fails fast when no env values exist", () => {
    expect(() => resolveDatabaseUrl({ env: {} })).toThrow(
      "DATABASE_URL or POSTGRES_PORT is required"
    );
  });
});

describe("resolveDatabaseUrlFromSources", () => {
  it("uses db env database url when explicit env is absent", () => {
    const resolved = resolveDatabaseUrlFromSources({
      dbEnvDatabaseUrl: "postgres://file:file@localhost:6000/from-file"
    });

    expect(resolved).toBe("postgres://file:file@localhost:6000/from-file");
  });

  it("builds a URL from fallback port when provided", () => {
    const resolved = resolveDatabaseUrlFromSources({
      fallbackPostgresPort: "6543"
    });

    expect(resolved).toBe("postgres://compass:compass@localhost:6543/compass");
  });

  it("fails fast when all sources are missing", () => {
    expect(() => resolveDatabaseUrlFromSources({})).toThrow(
      "DATABASE_URL or POSTGRES_PORT is required"
    );
  });
});
