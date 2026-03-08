import { beforeEach, describe, expect, it, vi } from "vitest";

const createApiClientMock = vi.hoisted(() => vi.fn());

vi.mock("@compass/sdk", () => ({
  createApiClient: createApiClientMock
}));

describe("compass client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.VITE_API_BASE_URL;
    delete process.env.API_BASE_URL;
  });

  it("prefers the configured API base URL over the request origin", async () => {
    process.env.VITE_API_BASE_URL = "http://127.0.0.1:3001";
    const { __private__ } = await import("~/lib/api/compass-client");

    expect(__private__.resolveCompassBaseUrl(new Request("http://127.0.0.1:3010/chat"))).toBe(
      "http://127.0.0.1:3001"
    );
  });

  it("falls back to the request origin when no API base URL is configured", async () => {
    const { __private__ } = await import("~/lib/api/compass-client");

    expect(__private__.resolveCompassBaseUrl(new Request("http://127.0.0.1:3010/chat"))).toBe(
      "http://127.0.0.1:3010"
    );
  });

  it("forwards cookie, origin, and request bodies when routing API calls server-side", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response("{}"));
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const { __private__ } = await import("~/lib/api/compass-client");
      const request = new Request("http://127.0.0.1:3010/chat", {
        headers: {
          cookie: "__Host-compass_session=session-token",
          origin: "http://127.0.0.1:3010",
          referer: "http://127.0.0.1:3010/chat"
        }
      });

      const forwardedFetch = __private__.createForwardingFetch(request);
      await forwardedFetch(
        new Request("http://127.0.0.1:3001/v1/threads", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            workspaceSlug: "personal"
          })
        })
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [forwardedRequest] = fetchMock.mock.calls[0] ?? [];
      const headers = new Headers((forwardedRequest as Request).headers);
      expect(headers.get("cookie")).toBe("__Host-compass_session=session-token");
      expect(headers.get("origin")).toBe("http://127.0.0.1:3010");
      expect(headers.get("referer")).toBe("http://127.0.0.1:3010/chat");
      expect(headers.get("content-type")).toBe("application/json");
      expect((forwardedRequest as Request).method).toBe("POST");
      await expect((forwardedRequest as Request).text()).resolves.toBe(
        '{"workspaceSlug":"personal"}'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("builds the api client with the resolved base URL and forwarding fetch", async () => {
    process.env.VITE_API_BASE_URL = "http://127.0.0.1:3001";
    const fakeClient = { GET: vi.fn() };
    createApiClientMock.mockReturnValue(fakeClient);

    const { createCompassClient } = await import("~/lib/api/compass-client");
    const client = createCompassClient(
      new Request("http://127.0.0.1:3010/chat", {
        headers: {
          cookie: "__Host-compass_session=session-token"
        }
      })
    );

    expect(client).toBe(fakeClient);
    expect(createApiClientMock).toHaveBeenCalledTimes(1);
    expect(createApiClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://127.0.0.1:3001",
        fetch: expect.any(Function)
      })
    );
  });
});
