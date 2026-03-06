import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEvent, ChatTimelineItem } from "~/features/chat/agent-types";
import {
  __private__,
  useChatTimeline,
  type TimelinePromptRecord
} from "~/features/chat/hooks/use-chat-timeline";
import type { ChatActionData } from "~/features/chat/chat-action";
import type { AssistantStoreMessage } from "~/features/chat/presentation/chat-runtime-store";

const normalizeAgentEventsMock = vi.hoisted(() => vi.fn());
const buildAssistantStoreMessagesMock = vi.hoisted(() => vi.fn());

vi.mock("~/features/chat/agent-event-normalizer", () => ({
  normalizeAgentEvents: normalizeAgentEventsMock
}));

vi.mock("~/features/chat/presentation/chat-runtime-store", () => ({
  buildAssistantStoreMessages: buildAssistantStoreMessagesMock
}));

function createEvent(input: Partial<AgentEvent>): AgentEvent {
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
  normalizeAgentEventsMock.mockReturnValue([]);
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
    normalizeAgentEventsMock.mockReturnValue([
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
        events: AgentEvent[];
        submitResult: ChatActionData | undefined;
      }) => useChatTimeline(props),
      {
        initialProps: {
          resetKey: "workspace-1:new",
          events: [createEvent({ turnId: "turn-9", method: "turn.started" })],
          submitResult: undefined
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
      } as ChatActionData
    });

    const timelineIds = result.current.timeline.map((item) => item.id);
    expect(timelineIds).toEqual(
      expect.arrayContaining(["prompt-req-7", "prompt-req-7-error", "normalized-1"])
    );
    expect(result.current.assistantMessages).toEqual([{ id: "assistant-message-1" }]);
  });

  it("adds a successful submit fallback assistant message when no assistant event exists", () => {
    normalizeAgentEventsMock.mockReturnValue([]);
    buildAssistantStoreMessagesMock.mockImplementation(
      ({ timeline }: { timeline: ChatTimelineItem[] }): AssistantStoreMessage[] =>
        timeline as AssistantStoreMessage[]
    );

    const { result } = renderHook(
      (props: {
        resetKey: string;
        events: AgentEvent[];
        submitResult: ChatActionData | undefined;
      }) => useChatTimeline(props),
      {
        initialProps: {
          resetKey: "workspace-1:thread-1",
          events: [],
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
        events: AgentEvent[];
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
      submitResult: {
        intent: "switchMode",
        ok: false,
        error: "Ignored in timeline"
      } as ChatActionData
    });

    expect(result.current.activeTurnId).toBeNull();
    expect(result.current.timeline.some((item) => item.id.startsWith("prompt-"))).toBe(false);
  });
});
