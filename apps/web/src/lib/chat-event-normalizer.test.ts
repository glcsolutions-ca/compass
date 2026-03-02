import { describe, expect, it } from "vitest";
import { normalizeAgentEvents } from "~/features/chat/agent-event-normalizer";
import type { AgentEvent } from "~/features/chat/agent-types";

describe("chat event normalizer", () => {
  it("maps known agent methods into timeline items", () => {
    const events: AgentEvent[] = [
      {
        cursor: 1,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "turn.started",
        payload: { text: "hello" },
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      {
        cursor: 2,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.delta",
        payload: { text: "Hi" },
        createdAt: "2026-01-01T00:00:00.100Z"
      },
      {
        cursor: 3,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.delta",
        payload: { text: " there" },
        createdAt: "2026-01-01T00:00:00.200Z"
      },
      {
        cursor: 4,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "turn.completed",
        payload: {},
        createdAt: "2026-01-01T00:00:00.300Z"
      }
    ];

    const timeline = normalizeAgentEvents(events);

    expect(timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "message",
          role: "user",
          text: "hello"
        }),
        expect.objectContaining({
          kind: "message",
          role: "assistant",
          text: "Hi there",
          streaming: false
        })
      ])
    );
    expect(timeline.some((item) => item.kind === "status")).toBe(false);
  });

  it("maps runtime events into runtime timeline entries", () => {
    const timeline = normalizeAgentEvents([
      {
        cursor: 9,
        threadId: "thread_1",
        turnId: null,
        method: "runtime.customEvent",
        payload: { detail: "ok" },
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    expect(timeline).toEqual([
      expect.objectContaining({
        kind: "runtime",
        label: "Runtime customEvent",
        payload: { detail: "ok" }
      })
    ]);
  });

  it("maps item lifecycle events into runtime timeline entries", () => {
    const timeline = normalizeAgentEvents([
      {
        cursor: 11,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.started",
        payload: { type: "assistant_message" },
        createdAt: "2026-01-01T00:00:01.000Z"
      },
      {
        cursor: 12,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.completed",
        payload: { type: "assistant_message" },
        createdAt: "2026-01-01T00:00:02.000Z"
      }
    ]);

    expect(timeline).toEqual([
      expect.objectContaining({
        kind: "runtime",
        label: "Item started",
        detail: "assistant_message"
      }),
      expect.objectContaining({
        kind: "runtime",
        label: "Item completed",
        detail: "assistant_message"
      })
    ]);
  });

  it("keeps unknown methods as generic timeline events", () => {
    const timeline = normalizeAgentEvents([
      {
        cursor: 10,
        threadId: "thread_1",
        turnId: null,
        method: "custom.newMethod",
        payload: { detail: "ok" },
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    expect(timeline[0]).toEqual(
      expect.objectContaining({
        kind: "unknown",
        label: "Custom newMethod"
      })
    );
  });
});
