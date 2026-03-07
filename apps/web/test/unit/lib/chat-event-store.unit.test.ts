import { describe, expect, it } from "vitest";
import { mergeChatEvents } from "~/features/chat/thread-event-store";
import type { ChatEvent } from "~/features/chat/thread-types";

describe("agent event merge", () => {
  it("merges deterministically and suppresses duplicate cursors", () => {
    const existing: ChatEvent[] = [
      {
        cursor: 1,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "turn.started",
        payload: {},
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];

    const incoming: ChatEvent[] = [
      {
        cursor: 1,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "turn.started",
        payload: { replay: true },
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      {
        cursor: 2,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.delta",
        payload: { text: "hi" },
        createdAt: "2026-01-01T00:00:00.100Z"
      }
    ];

    const result = mergeChatEvents(existing, incoming);

    expect(result.nextCursor).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.cursor)).toEqual([1, 2]);
    expect(result.events[0]?.payload).toEqual({ replay: true });
  });
});
