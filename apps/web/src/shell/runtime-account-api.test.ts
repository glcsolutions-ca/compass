import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeRuntimeStream } from "~/components/shell/runtime-account-api";

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string | URL) {
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
    vi.unstubAllGlobals();
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
});
