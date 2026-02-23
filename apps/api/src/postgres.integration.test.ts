import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { buildApiApp } from "./app.js";
import { loadApiConfig } from "./config/index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for integration tests");
}

const config = loadApiConfig({
  DATABASE_URL: databaseUrl,
  LOG_LEVEL: "silent"
});

describe("Postgres integration", () => {
  const directDb = new Client({ connectionString: databaseUrl });
  const app = buildApiApp({ config });

  beforeAll(async () => {
    await directDb.connect();
    await app.ready();
  });

  afterAll(async () => {
    await Promise.all([app.close(), directDb.end()]);
  });

  it("connects to Postgres through direct client", async () => {
    const result = await directDb.query("SELECT 1 AS ok");

    expect(result.rows[0]?.ok).toBe(1);
  });

  it("registers fastify postgres decorator when DATABASE_URL is provided", async () => {
    expect(app.hasDecorator("pg")).toBe(true);

    const result = await app.pg.query("SELECT 1 AS ok");
    expect(result.rows[0]?.ok).toBe(1);
  });

  it("still serves system endpoints while postgres is configured", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    const openapi = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(health.statusCode).toBe(200);
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json().paths["/health"]).toBeDefined();
  });
});
