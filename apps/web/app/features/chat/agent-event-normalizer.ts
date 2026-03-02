import type {
  AgentEvent,
  ChatTimelineItem,
  ChatTimelineMessagePart
} from "~/features/chat/agent-types";
import {
  mergeTimelineMessageParts,
  parseItemDeltaParts,
  parseRuntimeDataPart,
  readTimelineMessageText
} from "~/features/chat/runtime-part-parser";

function readPayloadObject(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readRuntimeDetail(payload: unknown): string | null {
  const data = readPayloadObject(payload);
  if (!data) {
    return null;
  }

  const directText =
    readText(data.message) ??
    readText(data.status) ??
    readText(data.type) ??
    readText(data.text) ??
    readText(data.operation);
  if (directText) {
    return directText;
  }

  const keys = Object.keys(data);
  if (keys.length < 1) {
    return null;
  }

  return `Payload keys: ${keys.join(", ")}`;
}

function readItemLifecycleDetail(payload: unknown): string | null {
  const data = readPayloadObject(payload);
  if (!data) {
    return null;
  }

  return (
    readText(data.type) ??
    readText(data.itemType) ??
    readText(data.status) ??
    readText(data.name) ??
    readText(data.role)
  );
}

function formatEventLabel(method: string): string {
  const [scope, action] = method.split(".");
  if (!scope || !action) {
    return method;
  }

  return `${scope[0]?.toUpperCase() ?? ""}${scope.slice(1)} ${action}`;
}

function buildAssistantTurnKey(turnId: string | null, cursor: number): string {
  return turnId ?? `cursor:${cursor.toString()}`;
}

function upsertAssistantMessage(input: {
  timeline: ChatTimelineItem[];
  assistantMessageByTurn: Map<string, number>;
  turnId: string | null;
  cursor: number;
  createdAt: string | null;
  parts: ChatTimelineMessagePart[];
  streaming?: boolean;
}): void {
  const turnKey = buildAssistantTurnKey(input.turnId, input.cursor);
  const priorIndex = input.assistantMessageByTurn.get(turnKey);

  if (priorIndex !== undefined) {
    const previous = input.timeline[priorIndex];
    if (previous && previous.kind === "message" && previous.role === "assistant") {
      const mergedParts = mergeTimelineMessageParts(previous.parts, input.parts);
      input.timeline[priorIndex] = {
        ...previous,
        parts: mergedParts,
        text: readTimelineMessageText(mergedParts),
        cursor: input.cursor,
        createdAt: input.createdAt,
        streaming: input.streaming ?? previous.streaming
      };
      return;
    }
  }

  const nextIndex = input.timeline.length;
  input.timeline.push({
    id: `evt-${input.cursor}`,
    kind: "message",
    role: "assistant",
    text: readTimelineMessageText(input.parts),
    parts: input.parts,
    turnId: input.turnId,
    cursor: input.cursor,
    streaming: input.streaming ?? false,
    createdAt: input.createdAt
  });
  input.assistantMessageByTurn.set(turnKey, nextIndex);
}

export function normalizeAgentEvents(events: readonly AgentEvent[]): ChatTimelineItem[] {
  const sorted = [...events].sort((left, right) => left.cursor - right.cursor);
  const timeline: ChatTimelineItem[] = [];
  const assistantMessageByTurn = new Map<string, number>();

  for (const event of sorted) {
    const method = event.method;
    const turnId = event.turnId ?? null;
    const createdAt = event.createdAt ?? null;
    const label = formatEventLabel(method);

    if (method === "turn.started") {
      const payload = readPayloadObject(event.payload);
      const promptText = readText(payload?.text) ?? readText(payload?.input);

      if (promptText) {
        timeline.push({
          id: `evt-${event.cursor}-user`,
          kind: "message",
          role: "user",
          text: promptText,
          parts: [
            {
              type: "text",
              text: promptText
            }
          ],
          turnId,
          cursor: event.cursor,
          streaming: false,
          createdAt
        });
      }
      continue;
    }

    if (method === "item.delta") {
      const deltaParts = parseItemDeltaParts({
        cursor: event.cursor,
        payload: event.payload
      });

      if (deltaParts.length < 1) {
        timeline.push({
          id: `evt-${event.cursor}`,
          kind: "runtime",
          label: "Item delta",
          detail: readRuntimeDetail(event.payload),
          payload: event.payload,
          turnId,
          cursor: event.cursor,
          createdAt
        });
        continue;
      }

      upsertAssistantMessage({
        timeline,
        assistantMessageByTurn,
        turnId,
        cursor: event.cursor,
        createdAt,
        parts: deltaParts,
        streaming: true
      });
      continue;
    }

    if (method === "turn.completed") {
      if (turnId) {
        const priorIndex = assistantMessageByTurn.get(turnId);
        if (priorIndex !== undefined) {
          const previous = timeline[priorIndex];
          if (previous && previous.kind === "message" && previous.role === "assistant") {
            timeline[priorIndex] = {
              ...previous,
              streaming: false,
              cursor: event.cursor,
              createdAt
            };
          }
        }
      }
      continue;
    }

    if (method === "approval.requested" || method === "approval.resolved") {
      timeline.push({
        id: `evt-${event.cursor}`,
        kind: "approval",
        label: method === "approval.requested" ? "Approval requested" : "Approval resolved",
        detail: null,
        turnId,
        cursor: event.cursor,
        createdAt
      });
      continue;
    }

    if (method === "item.started" || method === "item.completed") {
      timeline.push({
        id: `evt-${event.cursor}`,
        kind: "runtime",
        label: method === "item.started" ? "Item started" : "Item completed",
        detail: readItemLifecycleDetail(event.payload),
        payload: event.payload,
        turnId,
        cursor: event.cursor,
        createdAt
      });
      continue;
    }

    const runtimeDataPart = parseRuntimeDataPart({
      method,
      payload: event.payload
    });
    if (runtimeDataPart) {
      upsertAssistantMessage({
        timeline,
        assistantMessageByTurn,
        turnId,
        cursor: event.cursor,
        createdAt,
        parts: [runtimeDataPart]
      });
      continue;
    }

    if (method === "thread.started" || method === "thread.modeSwitched") {
      continue;
    }

    if (method === "error") {
      timeline.push({
        id: `evt-${event.cursor}`,
        kind: "status",
        label: "Error",
        detail: readText(readPayloadObject(event.payload)?.message),
        turnId,
        cursor: event.cursor,
        createdAt
      });
      continue;
    }

    timeline.push({
      id: `evt-${event.cursor}`,
      kind: "unknown",
      label,
      payload: event.payload,
      turnId,
      cursor: event.cursor,
      createdAt
    });
  }

  return timeline;
}
