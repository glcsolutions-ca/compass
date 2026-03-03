import { describe, expect, it, vi } from "vitest";
import { createApiClient, getHealth, getPing } from "./client.js";
import * as sdk from "./index.js";

describe("sdk client", () => {
  it("reads health and ping", async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : (() => {
                  throw new Error(`Unexpected request input type: ${typeof input}`);
                })();

      if (url.endsWith("/health")) {
        return new Response(
          JSON.stringify({
            status: "ok",
            timestamp: "2026-02-25T00:00:00.000Z"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/v1/ping")) {
        return new Response(JSON.stringify({ ok: true, service: "api" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response("not found", { status: 404 });
    });

    const client = createApiClient({
      baseUrl: "http://localhost:3001",
      fetch: fetchMock as unknown as typeof fetch
    });

    await expect(getHealth(client)).resolves.toEqual({
      status: "ok",
      timestamp: "2026-02-25T00:00:00.000Z"
    });

    await expect(getPing(client)).resolves.toEqual({ ok: true, service: "api" });
  });

  it("throws when health payload is missing", async () => {
    const client = {
      GET: vi.fn(async () => ({ data: undefined }))
    } as unknown as ReturnType<typeof createApiClient>;

    await expect(getHealth(client)).rejects.toThrow("Health request returned no payload");
  });

  it("throws when ping payload is missing", async () => {
    const client = {
      GET: vi.fn(async () => ({ data: undefined }))
    } as unknown as ReturnType<typeof createApiClient>;

    await expect(getPing(client)).rejects.toThrow("Ping request returned no payload");
  });

  it("re-exports client constructors from index", () => {
    expect(typeof sdk.createApiClient).toBe("function");
    expect(typeof sdk.getHealth).toBe("function");
    expect(typeof sdk.getPing).toBe("function");
  });
});
