import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeView, clientLoader, resolveApiBaseUrl } from "../../app/routes/home.js";

const env = import.meta.env as Record<string, string | undefined>;
const originalApiBaseUrl = env.VITE_API_BASE_URL;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  env.VITE_API_BASE_URL = originalApiBaseUrl;
});

beforeEach(() => {
  env.VITE_API_BASE_URL = "http://runtime-api.test";
});

function normalizeRequestUrl(requestUrl: unknown): string | undefined {
  if (typeof requestUrl === "string") {
    return requestUrl;
  }
  if (requestUrl instanceof URL) {
    return requestUrl.toString();
  }
  if (requestUrl instanceof Request) {
    return requestUrl.url;
  }

  return undefined;
}

describe("Home route URL resolution", () => {
  it("falls back to the default URL when env var is missing", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("http://localhost:3001");
    expect(resolveApiBaseUrl("")).toBe("http://localhost:3001");
    expect(resolveApiBaseUrl("   ")).toBe("http://localhost:3001");
  });

  it("trims whitespace and trailing slashes", () => {
    expect(resolveApiBaseUrl(" https://runtime-api.test/// ")).toBe("https://runtime-api.test");
  });
});

describe("Home route loader", () => {
  it("returns health data when the API request succeeds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          timestamp: "2026-02-25T00:00:00.000Z"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const result = await clientLoader({
      request: new Request("http://web.test/")
    });

    expect(result).toEqual({
      apiBaseUrl: "http://runtime-api.test",
      health: {
        status: "ok",
        timestamp: "2026-02-25T00:00:00.000Z"
      },
      error: null
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(normalizeRequestUrl(requestUrl)).toBe("http://runtime-api.test/health");
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses fallback API base URL when VITE_API_BASE_URL is absent", async () => {
    env.VITE_API_BASE_URL = "";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          timestamp: "2026-02-25T00:00:00.000Z"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const result = await clientLoader({
      request: new Request("http://web.test/")
    });

    expect(result.apiBaseUrl).toBe("http://localhost:3001");
    expect(result.health).toEqual({
      status: "ok",
      timestamp: "2026-02-25T00:00:00.000Z"
    });
    expect(result.error).toBeNull();

    const [requestUrl] = fetchMock.mock.calls[0] ?? [];
    expect(normalizeRequestUrl(requestUrl)).toBe("http://localhost:3001/health");
  });

  it("returns an error when the API responds with an unsuccessful status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("service unavailable", { status: 503 })
    );

    const result = await clientLoader({
      request: new Request("http://web.test/")
    });

    expect(result.health).toBeNull();
    expect(result.error).toContain("Health request failed with 503");
  });

  it("returns an error when the health response payload shape is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "bad", timestamp: 123 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await clientLoader({
      request: new Request("http://web.test/")
    });

    expect(result.health).toBeNull();
    expect(result.error).toContain("Health response payload is invalid");
  });
});

describe("Home route view", () => {
  it("renders loading state when no health data is present", () => {
    render(
      <HomeView apiBaseUrl="http://runtime-api.test" health={null} error={null} loading={true} />
    );

    expect(screen.getByTestId("api-base-url").textContent?.trim()).toBe("http://runtime-api.test");
    expect(screen.getByTestId("api-health-status").textContent?.trim()).toBe("loading");
    expect(screen.getByTestId("api-health-error").textContent?.trim()).toBe("none");
  });

  it("renders health data when available", () => {
    render(
      <HomeView
        apiBaseUrl="http://runtime-api.test"
        health={{ status: "ok", timestamp: "2026-02-25T00:00:00.000Z" }}
        error={null}
        loading={false}
      />
    );

    expect(screen.getByTestId("api-health-status").textContent?.trim()).toBe("ok");
    expect(screen.getByTestId("api-health-timestamp").textContent?.trim()).toBe(
      "2026-02-25T00:00:00.000Z"
    );
  });
});
