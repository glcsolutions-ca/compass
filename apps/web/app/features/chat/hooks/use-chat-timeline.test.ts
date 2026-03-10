import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatEvent, ChatTimelineItem } from "~/features/chat/thread-types";
import {
  __private__,
  useChatTimeline,
  type TimelinePromptRecord
} from "~/features/chat/hooks/use-chat-timeline";
import type { ChatActionData } from "~/features/chat/chat-action";
import type { AssistantStoreMessage } from "~/features/chat/presentation/chat-runtime-store";

const normalizeChatEventsMock = vi.hoisted(() => vi.fn());
const buildAssistantStoreMessagesMock = vi.hoisted(() => vi.fn());

vi.mock("~/features/chat/thread-event-normalizer", () => ({
  normalizeChatEvents: normalizeChatEventsMock
}));

vi.mock("~/features/chat/presentation/chat-runtime-store", () => ({
  buildAssistantStoreMessages: buildAssistantStoreMessagesMock
}));

function createEvent(input: Partial<ChatEvent>): ChatEvent {
  return {
    cursor: 1,
    threadId: "thread-1",
    turnId: "turn-1",
    method: "turn.started",
    payload: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    ...input
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  normalizeChatEventsMock.mockReturnValue([]);
  buildAssistantStoreMessagesMock.mockReturnValue([]);
});

describe("chat timeline prompt upsert", () => {
  it("appends a new prompt record for a new client request id", () => {
    const createdAt = "2026-03-01T00:00:00.000Z";
    const nextRecord: TimelinePromptRecord = {
      id: "prompt-req-1",
      clientRequestId: "req-1",
      turnId: null,
      text: "First prompt",
      answer: null,
      state: "pending",
      error: null,
      createdAt
    };

    const result = __private__.upsertTimelinePromptRecords([], nextRecord);

    expect(result).toEqual([nextRecord]);
  });

  it("updates state by client request id while preserving the original createdAt", () => {
    const initial: TimelinePromptRecord = {
      id: "prompt-req-1",
      clientRequestId: "req-1",
      turnId: null,
      text: "First prompt",
      answer: null,
      state: "pending",
      error: null,
      createdAt: "2026-03-01T00:00:00.000Z"
    };
    const update: TimelinePromptRecord = {
      id: "prompt-req-1",
      clientRequestId: "req-1",
      turnId: "turn-1",
      text: "First prompt",
      answer: null,
      state: "failed",
      error: "Unable to submit this prompt.",
      createdAt: "2026-03-01T00:01:00.000Z"
    };

    const result = __private__.upsertTimelinePromptRecords([initial], update);

    expect(result).toEqual([
      {
        ...update,
        createdAt: initial.createdAt
      }
    ]);
  });
});

describe("useChatTimeline", () => {
  it("adds failed submit fallback items and computes active turn id", () => {
    normalizeChatEventsMock.mockReturnValue([
      {
        id: "normalized-1",
        kind: "status",
        label: "turn started",
        detail: null,
        turnId: "turn-9",
        cursor: 9,
        createdAt: "2026-03-01T00:00:09.000Z"
      }
    ]);
    buildAssistantStoreMessagesMock.mockReturnValue([{ id: "assistant-message-1" }]);

    const { result, rerender } = renderHook(
      (props: {
        resetKey: string;
        events: ChatEvent[];
        submitResult: ChatActionData | undefined;
      }) => useChatTimeline(props),
      {
        initialProps: {
          resetKey: "workspace-1:new",
          events: [createEvent({ turnId: "turn-9", method: "turn.started" })],
          submitResult: undefined,
          pendingSubmission: null
        }
      }
    );

    expect(result.current.activeTurnId).toBe("turn-9");
    expect(result.current.timeline).toHaveLength(1);

    rerender({
      resetKey: "workspace-1:new",
      events: [createEvent({ turnId: "turn-9", method: "turn.started" })],
      submitResult: {
        intent: "sendMessage",
        ok: false,
        clientRequestId: "req-7",
        prompt: "Investigate failure",
        turnId: "turn-9",
        error: "Unable to submit this prompt."
      } as ChatActionData,
      pendingSubmission: null
    });

    const timelineIds = result.current.timeline.map((item) => item.id);
    expect(timelineIds).toEqual(
      expect.arrayContaining(["prompt-req-7", "prompt-req-7-error", "normalized-1"])
    );
    expect(result.current.assistantMessages).toEqual([{ id: "assistant-message-1" }]);
  });

  it("adds a successful submit fallback assistant message when no assistant event exists", () => {
    normalizeChatEventsMock.mockReturnValue([]);
    buildAssistantStoreMessagesMock.mockImplementation(
      ({ timeline }: { timeline: ChatTimelineItem[] }): AssistantStoreMessage[] =>
        timeline as AssistantStoreMessage[]
    );

    const { result } = renderHook(
      (props: {
        resetKey: string;
        events: ChatEvent[];
        submitResult: ChatActionData | undefined;
      }) => useChatTimeline(props),
      {
        initialProps: {
          resetKey: "workspace-1:thread-1",
          events: [],
          pendingSubmission: null,
          submitResult: {
            intent: "sendMessage",
            ok: true,
            clientRequestId: "req-success",
            prompt: "hello",
            answer: "echo:hello",
            threadId: "thread-1",
            turnId: "turn-1",
            executionMode: "local"
          } as ChatActionData
        }
      }
    );

    expect(result.current.timeline).toEqual([
      expect.objectContaining({
        id: "prompt-req-success",
        kind: "message",
        role: "user",
        text: "hello",
        turnId: "turn-1"
      }),
      expect.objectContaining({
        id: "prompt-req-success-assistant",
        kind: "message",
        role: "assistant",
        text: "echo:hello",
        turnId: "turn-1"
      })
    ]);
  });

  it("clears fallback prompts on reset key change and clears active turn after interruption", () => {
    const { result, rerender } = renderHook(
      (props: {
        resetKey: string;
        events: ChatEvent[];
        submitResult: ChatActionData | undefined;
      }) => useChatTimeline(props),
      {
        initialProps: {
          resetKey: "workspace-1:new",
          events: [
            createEvent({ cursor: 1, turnId: "turn-1", method: "turn.started" }),
            createEvent({ cursor: 2, turnId: "turn-2", method: "turn.started" }),
            createEvent({ cursor: 3, turnId: "turn-2", method: "turn.completed" })
          ],
          pendingSubmission: null,
          submitResult: {
            intent: "sendMessage",
            ok: false,
            clientRequestId: "req-reset",
            prompt: "Retry this",
            answer: null,
            turnId: "turn-1",
            error: "Nope"
          } as ChatActionData
        }
      }
    );

    expect(result.current.activeTurnId).toBe("turn-1");
    expect(result.current.timeline.some((item) => item.id === "prompt-req-reset")).toBe(true);

    rerender({
      resetKey: "workspace-1:thread-2",
      events: [
        createEvent({ cursor: 5, turnId: "turn-1", method: "turn.started" }),
        createEvent({ cursor: 6, turnId: "turn-1", method: "turn.interrupted" })
      ],
      pendingSubmission: null,
      submitResult: {
        intent: "switchMode",
        ok: false,
        error: "Ignored in timeline"
      } as ChatActionData
    });

    expect(result.current.activeTurnId).toBeNull();
    expect(result.current.timeline.some((item) => item.id.startsWith("prompt-"))).toBe(false);
  });

  it("shows an optimistic user message and running assistant placeholder while a submit is pending", () => {
    normalizeChatEventsMock.mockReturnValue([]);
    buildAssistantStoreMessagesMock.mockImplementation(
      ({ timeline }: { timeline: ChatTimelineItem[] }): AssistantStoreMessage[] =>
        timeline as AssistantStoreMessage[]
    );

    const { result } = renderHook(
      (props: {
        resetKey: string;
        events: ChatEvent[];
        submitResult: ChatActionData | undefined;
        pendingSubmission: {
          intent: "sendMessage";
          clientRequestId: string;
          prompt: string;
          threadId: string | null;
          executionMode: "cloud";
          createdAt: string;
        } | null;
      }) => useChatTimeline(props),
      {
        initialProps: {
          resetKey: "workspace-1:thread-1",
          events: [],
          submitResult: undefined,
          pendingSubmission: {
            intent: "sendMessage",
            clientRequestId: "req-pending",
            prompt: "pending hello",
            threadId: "thread-1",
            executionMode: "cloud",
            createdAt: "2026-03-01T00:00:00.000Z"
          }
        }
      }
    );

    expect(result.current.timeline).toEqual([
      expect.objectContaining({
        id: "prompt-req-pending",
        kind: "message",
        role: "user",
        text: "pending hello"
      }),
      expect.objectContaining({
        id: "prompt-req-pending-assistant-pending",
        kind: "message",
        role: "assistant",
        text: "",
        streaming: true
      })
    ]);
  });

  it("deduplicates optimistic prompt fallbacks when turn.started echoes the same client request id", () => {
    const normalizedTimeline: ChatTimelineItem[] = [
      {
        id: "evt-1-user",
        kind: "message",
        role: "user",
        text: "pending hello",
        parts: [{ type: "text", text: "pending hello" }],
        turnId: "turn-echo",
        cursor: 1,
        streaming: false,
        createdAt: "2026-03-01T00:00:00.000Z"
      },
      {
        id: "evt-2-assistant",
        kind: "message",
        role: "assistant",
        text: "Acknowledged",
        parts: [{ type: "text", text: "Acknowledged" }],
        turnId: "turn-echo",
        cursor: 2,
        streaming: false,
        createdAt: "2026-03-01T00:00:00.100Z"
      }
    ];
    normalizeChatEventsMock.mockReturnValue(normalizedTimeline);
    buildAssistantStoreMessagesMock.mockImplementation(
      ({ timeline }: { timeline: ChatTimelineItem[] }): AssistantStoreMessage[] =>
        timeline as AssistantStoreMessage[]
    );

    const { result } = renderHook(
      (props: {
        resetKey: string;
        events: ChatEvent[];
        submitResult: ChatActionData | undefined;
        pendingSubmission: {
          intent: "sendMessage";
          clientRequestId: string;
          prompt: string;
          threadId: string | null;
          executionMode: "cloud";
          createdAt: string;
        } | null;
      }) => useChatTimeline(props),
      {
        initialProps: {
          resetKey: "workspace-1:thread-1",
          events: [
            createEvent({
              cursor: 1,
              turnId: "turn-echo",
              method: "turn.started",
              payload: {
                text: "pending hello",
                clientRequestId: "req-pending"
              }
            })
          ],
          submitResult: undefined,
          pendingSubmission: {
            intent: "sendMessage",
            clientRequestId: "req-pending",
            prompt: "pending hello",
            threadId: "thread-1",
            executionMode: "cloud",
            createdAt: "2026-03-01T00:00:00.000Z"
          }
        }
      }
    );

    expect(result.current.timeline).toEqual(normalizedTimeline);
    expect(
      result.current.timeline.filter(
        (item) => item.kind === "message" && item.role === "user" && item.text === "pending hello"
      )
    ).toHaveLength(1);
    expect(result.current.timeline.some((item) => item.id.startsWith("prompt-req-pending"))).toBe(
      false
    );
  });
});
