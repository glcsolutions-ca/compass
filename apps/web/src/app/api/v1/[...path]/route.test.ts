import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

function createContext(path: string[]) {
  return {
    params: Promise.resolve({
      path
    })
  };
}

function readArrayBufferAsText(value: ArrayBuffer | null | undefined) {
  if (!value) {
    return "";
  }
  return new TextDecoder().decode(new Uint8Array(value));
}

describe("web api proxy route", () => {
  beforeEach(() => {
    vi.stubEnv("API_BASE_URL", "http://upstream.internal:3001/");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("forwards allowed auth/content headers and strips hop-by-hop headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          connection: "keep-alive",
          "content-type": "application/json",
          "x-upstream-trace": "trace-123"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost:3000/api/v1/system/status?expand=true", {
      method: "GET",
      headers: {
        authorization: "Bearer smoke-token",
        accept: "application/json",
        connection: "keep-alive",
        host: "localhost:3000",
        "x-forwarded-for": "1.2.3.4"
      }
    });

    const response = await GET(request, createContext(["system", "status"]));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstCall = fetchMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall!;
    expect(url).toBe("http://upstream.internal:3001/api/v1/system/status?expand=true");
    expect(init.method).toBe("GET");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer smoke-token");
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("connection")).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBeNull();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-upstream-trace")).toBe("trace-123");
    expect(response.headers.get("connection")).toBeNull();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("forwards request body for non-GET methods", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const requestBody = JSON.stringify({ hello: "world" });
    const request = new NextRequest("http://localhost:3000/api/v1/messages", {
      method: "POST",
      body: requestBody,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer smoke-token"
      }
    });

    const response = await POST(request, createContext(["messages"]));
    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstCall = fetchMock.mock.calls.at(0);
    expect(firstCall).toBeDefined();
    const [, init] = firstCall!;
    expect(init.method).toBe("POST");
    const headers = init.headers as Headers;
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer smoke-token");
    expect(readArrayBufferAsText(init.body as ArrayBuffer)).toBe(requestBody);
  });

  it("returns deterministic 502 response when upstream fetch fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("upstream unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost:3000/api/v1/system/status", {
      method: "GET"
    });

    const response = await GET(request, createContext(["system", "status"]));

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Upstream API request failed",
      code: "UPSTREAM_UNAVAILABLE"
    });
  });

  it("returns deterministic 500 response in production when API_BASE_URL is missing", async () => {
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("http://localhost:3000/api/v1/system/status", {
      method: "GET"
    });

    const response = await GET(request, createContext(["system", "status"]));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "API base URL is not configured",
      code: "API_BASE_URL_REQUIRED"
    });
  });
});
