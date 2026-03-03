import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchRuntimeAccountRead,
  normalizeRequestError,
  postRuntimeLoginCancel,
  postRuntimeLoginStart,
  postRuntimeLogout,
  postRuntimeRateLimitsRead,
  RuntimeAccountRequestError,
  subscribeRuntimeStream
} from "~/components/shell/runtime-account-api";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static throwOnCreate = false;

  readonly url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string | URL) {
    if (MockWebSocket.throwOnCreate) {
      throw new Error("Unable to create websocket");
    }
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  close() {
    this.onclose?.();
  }
}

describe("subscribeRuntimeStream", () => {
  afterEach(() => {
    vi.useRealTimers();
    MockWebSocket.instances = [];
    MockWebSocket.throwOnCreate = false;
    vi.unstubAllGlobals();
  });

  it("normalizes request errors consistently", () => {
    const explicit = new RuntimeAccountRequestError("KNOWN", "Known message");
    expect(normalizeRequestError(explicit, "fallback")).toBe(explicit);

    const plainError = new Error("Plain message") as Error & { code?: string };
    plainError.code = "PLAIN_CODE";
    expect(normalizeRequestError(plainError, "fallback")).toEqual(
      new RuntimeAccountRequestError("PLAIN_CODE", "Plain message")
    );

    expect(normalizeRequestError({ code: "X", message: "  " }, "fallback")).toEqual(
      new RuntimeAccountRequestError("X", "fallback")
    );
    expect(normalizeRequestError(null, "fallback")).toEqual(
      new RuntimeAccountRequestError("UNKNOWN_ERROR", "fallback")
    );
  });

  it("reads runtime account state and sends refreshToken in request payload", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            provider: "local_process",
            capabilities: {
              interactiveAuth: true,
              supportsChatgptManaged: true,
              supportsApiKey: true,
              supportsChatgptAuthTokens: true,
              supportsRateLimits: true,
              supportsRuntimeStream: true
            },
            authMode: "chatgpt",
            requiresOpenaiAuth: true,
            account: {
              type: "chatgpt",
              email: "user@example.com"
            }
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const payload = await fetchRuntimeAccountRead(true);
    expect(payload.provider).toBe("local_process");
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/agent/runtime/account/read",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ refreshToken: true })
      })
    );
  });

  it("throws normalized request errors on non-ok responses", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ code: "AGENT_RUNTIME_UNAVAILABLE", message: "Unavailable" }),
          {
            status: 503,
            headers: {
              "content-type": "application/json"
            }
          }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRuntimeAccountRead()).rejects.toMatchObject({
      code: "AGENT_RUNTIME_UNAVAILABLE",
      message: "Unavailable"
    });
  });

  it("supports login start/cancel, logout, and rate-limit reads", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : "";
      if (url.endsWith("/login/start")) {
        return new Response(
          JSON.stringify({
            type: "chatgpt",
            loginId: "login_1",
            authUrl: "https://auth.example.com"
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      if (url.endsWith("/rate-limits/read")) {
        return new Response(
          JSON.stringify({
            rateLimits: {
              limitId: "codex",
              limitName: "Codex",
              primary: {
                usedPercent: 42,
                windowDurationMins: 15,
                resetsAt: 1_730_947_200
              },
              secondary: null
            },
            rateLimitsByLimitId: null
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }

      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const login = await postRuntimeLoginStart({ type: "chatgpt" });
    expect(login.loginId).toBe("login_1");
    expect(login.type).toBe("chatgpt");

    await expect(postRuntimeLoginCancel("login_1")).resolves.toBeUndefined();
    await expect(postRuntimeLogout()).resolves.toBeUndefined();

    const rateLimits = await postRuntimeRateLimitsRead();
    expect(rateLimits.rateLimits?.limitId).toBe("codex");
  });

  it("reconnects with cursor resume after disconnect", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);

    const received: Array<{ method: string; cursor: number | undefined }> = [];
    const unsubscribe = subscribeRuntimeStream((event) => {
      received.push({ method: event.method, cursor: event.cursor });
    });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).not.toContain("cursor=");

    MockWebSocket.instances[0]?.onmessage?.({
      data: JSON.stringify({
        cursor: 7,
        method: "account/updated",
        params: {
          authMode: "chatgpt"
        },
        createdAt: "2026-01-01T00:00:00.000Z"
      })
    });

    expect(received).toEqual([{ method: "account/updated", cursor: 7 }]);

    MockWebSocket.instances[0]?.onclose?.();
    vi.advanceTimersByTime(250);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1]?.url).toContain("cursor=7");

    unsubscribe();
  });

  it("ignores malformed notifications and reconnects after constructor failure", () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    const received: Array<{ method: string; cursor: number | undefined }> = [];

    const unsubscribe = subscribeRuntimeStream((event) => {
      received.push({ method: event.method, cursor: event.cursor });
    });

    const firstSocket = MockWebSocket.instances[0];
    if (!firstSocket) {
      throw new Error("Missing websocket instance");
    }

    firstSocket.onmessage?.({ data: "not-json" });
    firstSocket.onmessage?.({
      data: JSON.stringify({
        method: "unknown",
        createdAt: new Date().toISOString()
      })
    });
    expect(received).toEqual([]);

    firstSocket.onerror?.();
    vi.advanceTimersByTime(250);
    expect(MockWebSocket.instances.length).toBeGreaterThan(1);

    MockWebSocket.throwOnCreate = true;
    MockWebSocket.instances.at(-1)?.onclose?.();
    vi.advanceTimersByTime(250);

    MockWebSocket.throwOnCreate = false;
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances.length).toBeGreaterThan(2);

    unsubscribe();
  });
});
