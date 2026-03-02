import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeAgentEvents } from "~/features/chat/agent-event-normalizer";
import type { AgentEvent, ChatTimelineItem } from "~/features/chat/agent-types";
import {
  buildAssistantStoreMessages,
  type AssistantStoreMessage
} from "~/features/chat/presentation/chat-runtime-store";
import { readSubmittingPromptValue } from "~/features/chat/hooks/chat-compose-utils";

export interface TimelinePromptRecord {
  id: string;
  turnId: string | null;
  text: string;
  createdAt: string;
}

interface UseChatTimelineInput {
  resetKey: string;
  events: readonly AgentEvent[];
  submitState: "idle" | "submitting" | "loading";
  submitFormData: FormData | undefined;
}

interface UseChatTimelineOutput {
  timeline: ChatTimelineItem[];
  activeTurnId: string | null;
  assistantMessages: AssistantStoreMessage[];
  registerSubmittedPrompt: (input: { turnId: string | null; prompt: string }) => void;
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
  submitState,
  submitFormData
}: UseChatTimelineInput): UseChatTimelineOutput {
  const [timelinePrompts, setTimelinePrompts] = useState<TimelinePromptRecord[]>([]);

  useEffect(() => {
    setTimelinePrompts([]);
  }, [resetKey]);

  const registerSubmittedPrompt = useCallback(
    (input: { turnId: string | null; prompt: string }) => {
      const promptText = input.prompt.trim();
      if (!promptText) {
        return;
      }

      setTimelinePrompts((current) => {
        const alreadyExists = current.some(
          (record) => record.turnId === input.turnId && record.text === promptText
        );
        if (alreadyExists) {
          return current;
        }

        return [
          ...current,
          {
            id: `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            turnId: input.turnId,
            text: promptText,
            createdAt: new Date().toISOString()
          }
        ];
      });
    },
    []
  );

  const timeline = useMemo(() => {
    const normalized = normalizeAgentEvents(events);
    const userTurnsFromEvents = new Set(
      normalized
        .filter((item) => item.kind === "message" && item.role === "user")
        .map((item) => item.turnId)
        .filter((turnId): turnId is string => typeof turnId === "string" && turnId.length > 0)
    );

    const promptFallbackItems: ChatTimelineItem[] = timelinePrompts
      .filter((record) => !record.turnId || !userTurnsFromEvents.has(record.turnId))
      .map((record) => ({
        id: record.id,
        kind: "message",
        role: "user",
        text: record.text,
        turnId: record.turnId,
        cursor: null,
        streaming: false,
        createdAt: record.createdAt
      }));

    return [...promptFallbackItems, ...normalized].sort(sortTimelineByCursorOrTime);
  }, [events, timelinePrompts]);

  const activeTurnId = useMemo(() => readActiveTurnId(events), [events]);

  const submittingPromptValue = useMemo(
    () => readSubmittingPromptValue(submitFormData),
    [submitFormData]
  );

  const assistantMessages = useMemo(
    () =>
      buildAssistantStoreMessages({
        timeline,
        pendingPrompt: submitState !== "idle" ? submittingPromptValue : null
      }),
    [submitState, submittingPromptValue, timeline]
  );

  return {
    timeline,
    activeTurnId,
    assistantMessages,
    registerSubmittedPrompt
  };
}
