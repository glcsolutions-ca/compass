import { describe, expect, it } from "vitest";
import request from "supertest";
import { buildApiApp } from "./app.js";

describe("API app", () => {
  it("returns health status", async () => {
    const app = buildApiApp(() => new Date("2026-02-25T00:00:00.000Z"));

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      timestamp: "2026-02-25T00:00:00.000Z"
    });
  });

  it("serves openapi document", async () => {
    const app = buildApiApp();

    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths["/health"]).toBeTruthy();
    expect(response.body.paths["/v1/ping"]).toBeTruthy();
  });

  it("returns v1 ping", async () => {
    const app = buildApiApp();

    const response = await request(app).get("/v1/ping");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, service: "api" });
  });
});
