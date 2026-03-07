import { describe, expect, it } from "vitest";
import { createFetchJsonFixture } from "./http.js";

describe("createFetchJsonFixture", () => {
  it("returns JSON fixtures by full URL and tracks calls", async () => {
    const { fetch, calls } = createFetchJsonFixture({
      "http://localhost:3001/health": {
        status: 200,
        body: { status: "ok" }
      }
    });

    const response = await fetch("http://localhost:3001/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:3001/health");
  });

  it("falls back to path matching and default 404 response", async () => {
    const { fetch } = createFetchJsonFixture({
      "/v1/ping": {
        status: 200,
        body: { ok: true }
      }
    });

    const pingResponse = await fetch("http://localhost:3001/v1/ping");
    expect(pingResponse.status).toBe(200);
    await expect(pingResponse.json()).resolves.toEqual({ ok: true });

    const missingResponse = await fetch("http://localhost:3001/missing");
    expect(missingResponse.status).toBe(404);
  });
});
