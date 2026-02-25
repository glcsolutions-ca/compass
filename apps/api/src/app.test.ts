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
    expect(response.headers["x-powered-by"]).toBeUndefined();
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

  it("returns JSON for unknown routes", async () => {
    const app = buildApiApp();

    const response = await request(app).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "NOT_FOUND",
      message: "Route not found"
    });
  });

  it("returns JSON error for malformed request bodies", async () => {
    const app = buildApiApp();

    const response = await request(app)
      .post("/v1/ping")
      .set("content-type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: "INVALID_JSON",
      message: "Malformed JSON request body"
    });
  });
});
