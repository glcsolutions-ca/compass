import { describe, expect, it } from "vitest";
import { __private__, type TimelinePromptRecord } from "~/features/chat/hooks/use-chat-timeline";

describe("chat timeline prompt upsert", () => {
  it("appends a new prompt record for a new client request id", () => {
    const createdAt = "2026-03-01T00:00:00.000Z";
    const nextRecord: TimelinePromptRecord = {
      id: "prompt-req-1",
      clientRequestId: "req-1",
      turnId: null,
      text: "First prompt",
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
      state: "pending",
      error: null,
      createdAt: "2026-03-01T00:00:00.000Z"
    };
    const update: TimelinePromptRecord = {
      id: "prompt-req-1",
      clientRequestId: "req-1",
      turnId: "turn-1",
      text: "First prompt",
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
