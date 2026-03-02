import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeAgentEvents } from "~/features/chat/agent-event-normalizer";
import type { AgentEvent, ChatTimelineItem } from "~/features/chat/agent-types";
import type { ChatActionData } from "~/features/chat/chat-action";
import {
  buildAssistantStoreMessages,
  type AssistantStoreMessage
} from "~/features/chat/presentation/chat-runtime-store";

export interface TimelinePromptRecord {
  id: string;
  clientRequestId: string;
  turnId: string | null;
  text: string;
  state: "pending" | "confirmed" | "failed";
  error: string | null;
  createdAt: string;
}

interface UseChatTimelineInput {
  resetKey: string;
  events: readonly AgentEvent[];
  submitResult: ChatActionData | undefined;
}

interface UseChatTimelineOutput {
  timeline: ChatTimelineItem[];
  activeTurnId: string | null;
  assistantMessages: AssistantStoreMessage[];
}

function upsertTimelinePromptRecords(
  current: TimelinePromptRecord[],
  nextRecord: TimelinePromptRecord
): TimelinePromptRecord[] {
  const existingIndex = current.findIndex(
    (record) => record.clientRequestId === nextRecord.clientRequestId
  );
  if (existingIndex < 0) {
    return [...current, nextRecord];
  }

  const existingRecord = current[existingIndex];
  if (
    existingRecord &&
    existingRecord.turnId === nextRecord.turnId &&
    existingRecord.text === nextRecord.text &&
    existingRecord.state === nextRecord.state &&
    existingRecord.error === nextRecord.error
  ) {
    return current;
  }

  const next = [...current];
  next[existingIndex] = {
    ...nextRecord,
    createdAt: existingRecord?.createdAt ?? nextRecord.createdAt
  };
  return next;
}

function sortTimelineByCursorOrTime(
  left: Pick<ChatTimelineItem, "cursor" | "createdAt">,
  right: Pick<ChatTimelineItem, "cursor" | "createdAt">
): number {
  if (left.cursor !== null && right.cursor !== null) {
    return left.cursor - right.cursor;
  }

  const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
  return leftTime - rightTime;
}

function readActiveTurnId(events: readonly AgentEvent[]): string | null {
  const turnStatus = new Map<string, "active" | "completed" | "interrupted" | "error">();
  for (const event of events) {
    if (!event.turnId) {
      continue;
    }

    if (event.method === "turn.started") {
      turnStatus.set(event.turnId, "active");
    } else if (event.method === "turn.completed") {
      turnStatus.set(event.turnId, "completed");
    } else if (event.method === "error") {
      turnStatus.set(event.turnId, "error");
    } else if (event.method.includes("interrupt")) {
      turnStatus.set(event.turnId, "interrupted");
    }
  }

  const activeTurns = [...turnStatus.entries()].filter((entry) => entry[1] === "active");
  return activeTurns.length > 0 ? (activeTurns[activeTurns.length - 1]?.[0] ?? null) : null;
}

export function useChatTimeline({
  resetKey,
  events,
  submitResult
}: UseChatTimelineInput): UseChatTimelineOutput {
  const [timelinePrompts, setTimelinePrompts] = useState<TimelinePromptRecord[]>([]);

  useEffect(() => {
    setTimelinePrompts([]);
  }, [resetKey]);

  const upsertTimelinePrompt = useCallback((nextRecord: TimelinePromptRecord) => {
    setTimelinePrompts((current) => upsertTimelinePromptRecords(current, nextRecord));
  }, []);

  useEffect(() => {
    if (
      !submitResult ||
      (submitResult.intent !== "sendMessage" &&
        submitResult.intent !== "editMessage" &&
        submitResult.intent !== "reloadMessage")
    ) {
      return;
    }

    const clientRequestId = submitResult.clientRequestId?.trim();
    const prompt = submitResult.prompt?.trim();
    if (!clientRequestId || !prompt) {
      return;
    }

    if (submitResult.ok) {
      return;
    }

    upsertTimelinePrompt({
      id: `prompt-${clientRequestId}`,
      clientRequestId,
      turnId: submitResult.turnId,
      text: prompt,
      state: "failed",
      error: submitResult.error ?? "Unable to submit this prompt.",
      createdAt: new Date().toISOString()
    });
  }, [submitResult, upsertTimelinePrompt]);

  const timeline = useMemo(() => {
    const normalized = normalizeAgentEvents(events);
    const promptFallbackItems: ChatTimelineItem[] = timelinePrompts.flatMap((record) => {
      const baseMessage: ChatTimelineItem = {
        id: record.id,
        kind: "message",
        role: "user",
        text: record.text,
        turnId: record.turnId,
        cursor: null,
        streaming: false,
        createdAt: record.createdAt
      };

      return [
        baseMessage,
        {
          id: `${record.id}-error`,
          kind: "status",
          label: "Send failed",
          detail: record.error,
          turnId: record.turnId,
          cursor: null,
          createdAt: record.createdAt
        } satisfies ChatTimelineItem
      ];
    });

    return [...promptFallbackItems, ...normalized].sort(sortTimelineByCursorOrTime);
  }, [events, timelinePrompts]);

  const activeTurnId = useMemo(() => readActiveTurnId(events), [events]);

  const assistantMessages = useMemo(
    () =>
      buildAssistantStoreMessages({
        timeline
      }),
    [timeline]
  );

  return {
    timeline,
    activeTurnId,
    assistantMessages
  };
}

export const __private__ = {
  upsertTimelinePromptRecords
};
