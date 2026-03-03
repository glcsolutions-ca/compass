import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAgentTransport } from "~/features/chat/agent-transport";
import { listAgentThreadEventsClient, parseStreamEventPayload } from "~/features/chat/agent-client";
import type { AgentEvent, ChatTransportState } from "~/features/chat/agent-types";

vi.mock("~/features/chat/agent-client", () => ({
  listAgentThreadEventsClient: vi.fn(),
  parseStreamEventPayload: vi.fn()
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static shouldThrow = false;
  readonly url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn(() => undefined);

  constructor(url: string) {
    if (MockWebSocket.shouldThrow) {
      throw new Error("Unable to create websocket");
    }
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitOpen(): void {
    this.onopen?.();
  }

  emitMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  emitRawMessage(raw: string): void {
    this.onmessage?.({ data: raw } as MessageEvent);
  }

  emitError(): void {
    this.onerror?.();
  }

  emitClose(): void {
    this.onclose?.();
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("agent transport", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    MockWebSocket.instances = [];
    MockWebSocket.shouldThrow = false;
    vi.stubGlobal("WebSocket", MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalWebSocket) {
      vi.stubGlobal("WebSocket", originalWebSocket);
    } else {
      delete (globalThis as { WebSocket?: unknown }).WebSocket;
    }
  });

  it("streams websocket events, falls back to polling on disconnect, and dedupes cursors", async () => {
    const events: AgentEvent[] = [];
    const states: ChatTransportState[] = [];

    const streamEvent: AgentEvent = {
      cursor: 5,
      threadId: "thread-1",
      turnId: "turn-1",
      method: "turn.started",
      payload: { ok: true },
      createdAt: "2026-01-01T00:00:00.000Z"
    };
    const pollEvent: AgentEvent = {
      cursor: 6,
      threadId: "thread-1",
      turnId: "turn-1",
      method: "turn.completed",
      payload: { ok: true },
      createdAt: "2026-01-01T00:00:01.000Z"
    };

    vi.mocked(parseStreamEventPayload).mockReturnValue(streamEvent);
    vi.mocked(listAgentThreadEventsClient).mockResolvedValue({
      events: [streamEvent, pollEvent],
      nextCursor: 7
    });

    const handle = startAgentTransport({
      threadId: "thread-1",
      onEvent: (event) => {
        events.push(event);
      },
      onStateChange: (state) => {
        states.push(state);
      }
    });

    const websocket = MockWebSocket.instances[0];
    expect(websocket).toBeDefined();
    if (!websocket) {
      throw new Error("Missing websocket instance");
    }

    websocket.emitOpen();
    websocket.emitMessage({ kind: "event" });
    websocket.emitRawMessage("{");
    websocket.emitError();

    vi.advanceTimersByTime(150);
    await flushAsyncWork();

    expect(events).toEqual([streamEvent, pollEvent]);
    expect(vi.mocked(listAgentThreadEventsClient)).toHaveBeenCalledWith({
      threadId: "thread-1",
      cursor: 5,
      limit: 200
    });

    expect(states[0]?.lifecycle).toBe("connecting");
    expect(states.some((state) => state.lifecycle === "open")).toBe(true);
    expect(states.some((state) => state.lifecycle === "polling")).toBe(true);

    handle.stop();
    expect(websocket.close).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.lifecycle).toBe("closed");
  });

  it("falls back to polling when websocket creation fails", async () => {
    MockWebSocket.shouldThrow = true;
    const states: ChatTransportState[] = [];

    vi.mocked(listAgentThreadEventsClient).mockResolvedValue({
      events: [],
      nextCursor: 3
    });

    const handle = startAgentTransport({
      threadId: "thread-2",
      initialCursor: 2,
      onEvent: () => undefined,
      onStateChange: (state) => {
        states.push(state);
      }
    });

    vi.advanceTimersByTime(300);
    await flushAsyncWork();

    expect(vi.mocked(listAgentThreadEventsClient)).toHaveBeenCalledWith({
      threadId: "thread-2",
      cursor: 2,
      limit: 200
    });
    expect(states.some((state) => state.lifecycle === "error")).toBe(true);
    expect(states.some((state) => state.lifecycle === "polling")).toBe(true);

    handle.stop();
  });

  it("tracks reconnect count after websocket close", async () => {
    const states: ChatTransportState[] = [];
    vi.mocked(listAgentThreadEventsClient).mockResolvedValue({
      events: [],
      nextCursor: 1
    });

    const handle = startAgentTransport({
      threadId: "thread-3",
      onEvent: () => undefined,
      onStateChange: (state) => {
        states.push(state);
      }
    });

    const websocket = MockWebSocket.instances[0];
    if (!websocket) {
      throw new Error("Missing websocket instance");
    }

    websocket.emitOpen();
    websocket.emitClose();
    vi.advanceTimersByTime(150);
    await flushAsyncWork();

    expect(states.some((state) => state.reconnectCount > 0)).toBe(true);
    handle.stop();
  });
});
