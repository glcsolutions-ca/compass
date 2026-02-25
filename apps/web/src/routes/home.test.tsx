import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../../app/routes/home.js";

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

describe("Home route", () => {
  it("renders loading then success state", async () => {
    let resolveFetch: ((value: Response) => void) | null = null;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(() => pendingResponse);

    render(<Home />);
    expect(screen.getByTestId("api-health-status").textContent?.trim()).toBe("loading");

    resolveFetch?.(
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

    await waitFor(() => {
      expect(screen.getByTestId("api-health-status").textContent?.trim()).toBe("ok");
      expect(screen.getByTestId("api-health-error").textContent?.trim()).toBe("none");
    });
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

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("api-base-url").textContent?.trim()).toBe("http://localhost:3001");
      expect(screen.getByTestId("api-health-status").textContent?.trim()).toBe("ok");
    });

    const [requestUrl] = fetchMock.mock.calls[0] ?? [];
    const normalizedRequestUrl =
      typeof requestUrl === "string"
        ? requestUrl
        : requestUrl instanceof URL
          ? requestUrl.toString()
          : requestUrl instanceof Request
            ? requestUrl.url
            : undefined;

    expect(normalizedRequestUrl).toBe("http://localhost:3001/health");
  });

  it("renders failure state when health request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("api-health-status").textContent?.trim()).toBe("unavailable");
      expect(screen.getByTestId("api-health-error").textContent).toContain("connection refused");
    });
  });
});
