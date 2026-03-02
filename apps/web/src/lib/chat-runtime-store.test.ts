import { describe, expect, it } from "vitest";
import {
  buildAssistantStoreMessages,
  buildAssistantThreadListItems,
  convertAssistantStoreMessage
} from "~/features/chat/presentation/chat-runtime-store";

describe("chat runtime store mapping", () => {
  it("maps timeline messages and status entries into assistant store messages", () => {
    const mapped = buildAssistantStoreMessages({
      timeline: [
        {
          id: "m1",
          kind: "message",
          role: "user",
          text: "hello",
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
    expect(mapped[1]).toMatchObject({
      role: "assistant",
      text: "Turn completed"
    });
  });

  it("filters non-message runtime entries from the primary assistant timeline", () => {
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

  it("converts assistant store messages into assistant-ui thread messages", () => {
    const converted = convertAssistantStoreMessage({
      id: "evt-1",
      role: "assistant",
      text: "Runtime metadata",
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
          type: "text",
          text: "Runtime metadata"
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
