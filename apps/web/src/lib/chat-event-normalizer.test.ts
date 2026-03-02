import { describe, expect, it } from "vitest";
import { normalizeAgentEvents } from "~/features/chat/agent-event-normalizer";
import type { AgentEvent } from "~/features/chat/agent-types";

describe("chat event normalizer", () => {
  it("maps turn and delta events into stable user and assistant timeline messages", () => {
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
          text: "hello",
          parts: [{ type: "text", text: "hello" }]
        }),
        expect.objectContaining({
          kind: "message",
          role: "assistant",
          text: "Hi there",
          parts: [{ type: "text", text: "Hi there" }],
          streaming: false
        })
      ])
    );
  });

  it("converts runtime methods into assistant data parts", () => {
    const timeline = normalizeAgentEvents([
      {
        cursor: 9,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "runtime.customEvent",
        payload: { detail: "ok" },
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    expect(timeline).toEqual([
      expect.objectContaining({
        kind: "message",
        role: "assistant",
        parts: [
          {
            type: "data",
            name: "runtime.customEvent",
            data: { detail: "ok" }
          }
        ]
      })
    ]);
  });

  it("parses tool-call and reasoning shaped item deltas into structured parts", () => {
    const timeline = normalizeAgentEvents([
      {
        cursor: 11,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.delta",
        payload: {
          type: "reasoning",
          text: "Thinking through options"
        },
        createdAt: "2026-01-01T00:00:01.000Z"
      },
      {
        cursor: 12,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.delta",
        payload: {
          type: "tool_call",
          toolCallId: "call_1",
          toolName: "read_file",
          argsText: '{"path":"README.md"}',
          result: { lines: 42 }
        },
        createdAt: "2026-01-01T00:00:02.000Z"
      }
    ]);

    expect(timeline).toEqual([
      expect.objectContaining({
        kind: "message",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Thinking through options"
          },
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "read_file",
            argsText: '{"path":"README.md"}',
            args: { path: "README.md" },
            result: { lines: 42 },
            isError: false,
            parentId: undefined
          }
        ]
      })
    ]);
  });

  it("keeps item lifecycle events in runtime timeline entries", () => {
    const timeline = normalizeAgentEvents([
      {
        cursor: 13,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.started",
        payload: { type: "assistant_message" },
        createdAt: "2026-01-01T00:00:01.000Z"
      },
      {
        cursor: 14,
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

  it("maps unsupported item deltas into runtime fallback entries", () => {
    const timeline = normalizeAgentEvents([
      {
        cursor: 15,
        threadId: "thread_1",
        turnId: "turn_1",
        method: "item.delta",
        payload: { value: 123 },
        createdAt: "2026-01-01T00:00:03.000Z"
      }
    ]);

    expect(timeline).toEqual([
      expect.objectContaining({
        kind: "runtime",
        label: "Item delta",
        payload: { value: 123 }
      })
    ]);
  });

  it("keeps unknown methods as generic timeline events", () => {
    const timeline = normalizeAgentEvents([
      {
        cursor: 16,
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
