import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeChatEvents } from "~/features/chat/thread-event-normalizer";
import type { ChatEvent, ChatTimelineItem } from "~/features/chat/thread-types";
import type { ChatActionData } from "~/features/chat/chat-action";
import type { PendingSubmissionState } from "~/features/chat/hooks/use-chat-actions";
import {
  buildAssistantStoreMessages,
  type AssistantStoreMessage
} from "~/features/chat/presentation/chat-runtime-store";

export interface TimelinePromptRecord {
  id: string;
  clientRequestId: string;
  turnId: string | null;
  text: string;
  answer: string | null;
  state: "pending" | "confirmed" | "submitted" | "failed";
  error: string | null;
  createdAt: string;
}

interface UseChatTimelineInput {
  resetKey: string;
  events: readonly ChatEvent[];
  submitResult: ChatActionData | undefined;
  pendingSubmission: PendingSubmissionState | null;
}

interface UseChatTimelineOutput {
  timeline: ChatTimelineItem[];
  activeTurnId: string | null;
  assistantMessages: AssistantStoreMessage[];
}

function readPayloadObject(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function mapTurnIdsByClientRequestId(events: readonly ChatEvent[]): Map<string, string> {
  const turnIdsByClientRequestId = new Map<string, string>();

  for (const event of events) {
    if (event.method !== "turn.started" || !event.turnId) {
      continue;
    }

    const clientRequestId = readTrimmedString(readPayloadObject(event.payload)?.clientRequestId);
    if (!clientRequestId) {
      continue;
    }

    turnIdsByClientRequestId.set(clientRequestId, event.turnId);
  }

  return turnIdsByClientRequestId;
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

function readActiveTurnId(events: readonly ChatEvent[]): string | null {
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
  submitResult,
  pendingSubmission
}: UseChatTimelineInput): UseChatTimelineOutput {
  const [timelinePrompts, setTimelinePrompts] = useState<TimelinePromptRecord[]>([]);

  useEffect(() => {
    setTimelinePrompts([]);
  }, [resetKey]);

  const upsertTimelinePrompt = useCallback((nextRecord: TimelinePromptRecord) => {
    setTimelinePrompts((current) => upsertTimelinePromptRecords(current, nextRecord));
  }, []);

  useEffect(() => {
    if (!pendingSubmission) {
      return;
    }

    upsertTimelinePrompt({
      id: `prompt-${pendingSubmission.clientRequestId}`,
      clientRequestId: pendingSubmission.clientRequestId,
      turnId: null,
      text: pendingSubmission.prompt,
      answer: null,
      state: "pending",
      error: null,
      createdAt: pendingSubmission.createdAt
    });
  }, [pendingSubmission, upsertTimelinePrompt]);

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

    upsertTimelinePrompt({
      id: `prompt-${clientRequestId}`,
      clientRequestId,
      turnId: submitResult.turnId,
      text: prompt,
      answer: submitResult.answer ?? null,
      state: submitResult.ok ? "submitted" : "failed",
      error: submitResult.ok ? null : (submitResult.error ?? "Unable to submit this prompt."),
      createdAt: new Date().toISOString()
    });
  }, [submitResult, upsertTimelinePrompt]);

  const timeline = useMemo(() => {
    const normalized = normalizeChatEvents(events);
    const turnIdsByClientRequestId = mapTurnIdsByClientRequestId(events);
    const normalizedUserTurnIds = new Set<string>();
    const normalizedAssistantTurnIds = new Set<string>();
    for (const item of normalized) {
      if (item.kind !== "message" || typeof item.turnId !== "string") {
        continue;
      }

      if (item.role === "user") {
        normalizedUserTurnIds.add(item.turnId);
        continue;
      }

      if (item.role === "assistant") {
        normalizedAssistantTurnIds.add(item.turnId);
      }
    }
    const promptFallbackItems: ChatTimelineItem[] = timelinePrompts.flatMap((record) => {
      const items: ChatTimelineItem[] = [];
      const resolvedTurnId = record.turnId ?? turnIdsByClientRequestId.get(record.clientRequestId) ?? null;
      const hasNormalizedUser = resolvedTurnId ? normalizedUserTurnIds.has(resolvedTurnId) : false;
      const hasNormalizedAssistant = resolvedTurnId
        ? normalizedAssistantTurnIds.has(resolvedTurnId)
        : false;

      if (!hasNormalizedUser) {
        items.push({
          id: record.id,
          kind: "message",
          role: "user",
          text: record.text,
          parts: [
            {
              type: "text",
              text: record.text
            }
          ],
          turnId: resolvedTurnId,
          cursor: null,
          streaming: false,
          createdAt: record.createdAt
        });
      }

      if (record.state === "pending" && !hasNormalizedAssistant) {
        items.push({
          id: `${record.id}-assistant-pending`,
          kind: "message",
          role: "assistant",
          text: "",
          parts: [],
          turnId: resolvedTurnId,
          cursor: null,
          streaming: true,
          createdAt: record.createdAt
        });
      }

      if (record.state === "submitted" && record.answer && !hasNormalizedAssistant) {
        items.push({
          id: `${record.id}-assistant`,
          kind: "message",
          role: "assistant",
          text: record.answer,
          parts: [
            {
              type: "text",
              text: record.answer
            }
          ],
          turnId: resolvedTurnId,
          cursor: null,
          streaming: false,
          createdAt: record.createdAt
        });
      }

      if (record.state === "failed") {
        items.push({
          id: `${record.id}-error`,
          kind: "status",
          label: "Send failed",
          detail: record.error,
          turnId: resolvedTurnId,
          cursor: null,
          createdAt: record.createdAt
        });
      }

      return items;
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
