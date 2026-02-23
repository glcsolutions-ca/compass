import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "@compass/contracts";
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
  port: 3001
};

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

    await app.close();
  });
});
