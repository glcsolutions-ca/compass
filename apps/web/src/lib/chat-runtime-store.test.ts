import { describe, expect, it } from "vitest";
import {
  buildAssistantStoreMessages,
  buildAssistantThreadListItems,
  convertAssistantStoreMessage
} from "~/features/chat/presentation/chat-runtime-store";

describe("chat runtime store mapping", () => {
  it("maps timeline messages and status entries into part-aware assistant store messages", () => {
    const mapped = buildAssistantStoreMessages({
      timeline: [
        {
          id: "m1",
          kind: "message",
          role: "user",
          text: "hello",
          parts: [{ type: "text", text: "hello" }],
          turnId: "turn_1",
          cursor: 1,
          streaming: false,
          createdAt: "2026-01-01T00:00:00.000Z"
        },
        {
          id: "s1",
          kind: "status",
          label: "Turn completed",
          detail: null,
          turnId: "turn_1",
          cursor: 2,
          createdAt: "2026-01-01T00:00:01.000Z"
        }
      ]
    });

    expect(mapped).toHaveLength(2);
    expect(mapped[0]).toMatchObject({
      role: "user",
      text: "hello",
      parts: [{ type: "text", text: "hello" }]
    });
    expect(mapped[1]).toMatchObject({
      role: "assistant",
      text: "Turn completed",
      parts: [{ type: "text", text: "Turn completed" }]
    });
  });

  it("filters runtime-only entries from the primary assistant thread message list", () => {
    const mapped = buildAssistantStoreMessages({
      timeline: [
        {
          id: "runtime-1",
          kind: "runtime",
          label: "Runtime metadata",
          detail: "Payload keys: driver, turnId",
          payload: { driver: "mock", turnId: "turn_1" },
          turnId: "turn_1",
          cursor: 5,
          createdAt: "2026-01-01T00:00:01.000Z"
        }
      ]
    });

    expect(mapped).toEqual([]);
  });

  it("converts structured assistant parts into assistant-ui native message content", () => {
    const converted = convertAssistantStoreMessage({
      id: "evt-1",
      role: "assistant",
      text: "Runtime metadata",
      parts: [
        {
          type: "reasoning",
          text: "Thinking..."
        },
        {
          type: "tool-call",
          toolCallId: "tool_1",
          toolName: "read_file",
          argsText: '{"path":"README.md"}',
          result: { lines: 42 },
          isError: false
        },
        {
          type: "data",
          name: "runtime.metadata",
          data: { driver: "mock" }
        }
      ],
      turnId: "turn_1",
      cursor: 10,
      createdAt: "2026-01-01T00:00:02.000Z",
      streaming: true
    });

    expect(converted).toMatchObject({
      id: "evt-1",
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "Thinking..."
        },
        {
          type: "tool-call",
          toolCallId: "tool_1",
          toolName: "read_file",
          argsText: '{"path":"README.md"}',
          result: { lines: 42 },
          isError: false
        },
        {
          type: "data",
          name: "runtime.metadata",
          data: { driver: "mock" }
        }
      ],
      status: { type: "running" },
      metadata: {
        custom: {
          cursor: 10,
          turnId: "turn_1"
        }
      }
    });
  });

  it("maps local thread history to assistant-ui thread list items", () => {
    const mapped = buildAssistantThreadListItems([
      {
        threadId: "thread_1",
        title: "First thread",
        executionMode: "cloud",
        status: "completed",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    expect(mapped).toEqual([
      {
        status: "regular",
        id: "thread_1",
        title: "First thread"
      }
    ]);
  });
});
