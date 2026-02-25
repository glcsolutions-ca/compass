import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApiApp } from "../../src/app.js";

describe("API integration smoke", () => {
  it("exposes core endpoints", async () => {
    const app = buildApiApp();

    const health = await request(app).get("/health");
    const openapi = await request(app).get("/openapi.json");
    const ping = await request(app).get("/v1/ping");
    const missing = await request(app).get("/does-not-exist");

    expect(health.status).toBe(200);
    expect(health.body.status).toBe("ok");
    expect(openapi.status).toBe(200);
    expect(openapi.body.paths?.["/health"]).toBeTruthy();
    expect(openapi.body.paths?.["/v1/ping"]).toBeTruthy();
    expect(openapi.body.paths?.["/health"]?.get?.operationId).toBe("getHealth");
    expect(openapi.body.paths?.["/v1/ping"]?.get?.operationId).toBe("getPing");
    expect(ping.status).toBe(200);
    expect(ping.body).toEqual({ ok: true, service: "api" });
    expect(missing.status).toBe(404);
  });
});
