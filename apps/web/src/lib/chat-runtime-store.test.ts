import { describe, expect, it } from "vitest";
import {
  buildAssistantStoreMessages,
  buildAssistantThreadListItems,
  convertAssistantStoreMessage,
  isAssistantEventPartModel,
  readAssistantEventPartFromMetadata
} from "~/features/chat/presentation/chat-runtime-store";

describe("chat runtime store mapping", () => {
  it("maps timeline messages and event cards into assistant store messages", () => {
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
      ],
      pendingPrompt: "pending"
    });

    expect(mapped).toHaveLength(3);
    expect(mapped[1]).toMatchObject({
      role: "assistant",
      text: "Turn completed",
      eventPart: {
        kind: "status",
        cursor: 2,
        defaultTab: "activity"
      }
    });
    expect(mapped[2]).toMatchObject({
      role: "user",
      text: "pending"
    });
  });

  it("converts assistant store messages into assistant-ui thread messages", () => {
    const eventPayload = {
      kind: "runtime" as const,
      label: "Runtime metadata",
      detail: null,
      cursor: 10,
      defaultTab: "activity" as const
    };

    const converted = convertAssistantStoreMessage({
      id: "evt-1",
      role: "assistant",
      text: "Runtime metadata",
      turnId: "turn_1",
      cursor: 10,
      createdAt: "2026-01-01T00:00:02.000Z",
      streaming: true,
      eventPart: eventPayload
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
          turnId: "turn_1",
          eventPart: eventPayload
        }
      }
    });
  });

  it("reads event part metadata safely", () => {
    const metadata = {
      custom: {
        eventPart: {
          kind: "status",
          label: "Turn completed",
          detail: null,
          cursor: 3,
          defaultTab: "activity"
        }
      }
    };

    expect(readAssistantEventPartFromMetadata(metadata)).toMatchObject({
      kind: "status",
      cursor: 3
    });
    expect(readAssistantEventPartFromMetadata(null)).toBeNull();
    expect(readAssistantEventPartFromMetadata({ custom: { eventPart: "bad" } })).toBeNull();
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

  it("validates assistant event part metadata shape", () => {
    expect(
      isAssistantEventPartModel({
        kind: "approval",
        label: "Approval requested",
        detail: "Needs confirmation",
        cursor: 7,
        defaultTab: "activity"
      })
    ).toBe(true);

    expect(
      isAssistantEventPartModel({
        kind: "approval",
        label: "Approval requested",
        defaultTab: "bogus"
      })
    ).toBe(false);
  });
});
