import type {
  ChatEvent,
  ChatTimelineItem,
  ChatTimelineMessagePart
} from "~/features/chat/thread-types";
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

interface NormalizationContext {
  timeline: ChatTimelineItem[];
  assistantMessageByTurn: Map<string, number>;
}

interface EventView {
  method: string;
  turnId: string | null;
  createdAt: string | null;
}

function getEventView(event: ChatEvent): EventView {
  return {
    method: event.method,
    turnId: event.turnId ?? null,
    createdAt: event.createdAt ?? null
  };
}

function appendUserTurnStarted(
  context: NormalizationContext,
  event: ChatEvent,
  view: EventView
): void {
  const payload = readPayloadObject(event.payload);
  const promptText = readText(payload?.text) ?? readText(payload?.input);
  if (!promptText) {
    return;
  }

  context.timeline.push({
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
    turnId: view.turnId,
    cursor: event.cursor,
    streaming: false,
    createdAt: view.createdAt
  });
}

function appendItemDelta(context: NormalizationContext, event: ChatEvent, view: EventView): void {
  const deltaParts = parseItemDeltaParts({
    cursor: event.cursor,
    payload: event.payload
  });

  if (deltaParts.length < 1) {
    context.timeline.push({
      id: `evt-${event.cursor}`,
      kind: "runtime",
      label: "Item delta",
      detail: readRuntimeDetail(event.payload),
      payload: event.payload,
      turnId: view.turnId,
      cursor: event.cursor,
      createdAt: view.createdAt
    });
    return;
  }

  upsertAssistantMessage({
    timeline: context.timeline,
    assistantMessageByTurn: context.assistantMessageByTurn,
    turnId: view.turnId,
    cursor: event.cursor,
    createdAt: view.createdAt,
    parts: deltaParts,
    streaming: true
  });
}

function markTurnCompleted(context: NormalizationContext, event: ChatEvent, view: EventView): void {
  if (!view.turnId) {
    return;
  }

  const priorIndex = context.assistantMessageByTurn.get(view.turnId);
  if (priorIndex === undefined) {
    return;
  }

  const previous = context.timeline[priorIndex];
  if (!previous || previous.kind !== "message" || previous.role !== "assistant") {
    return;
  }

  context.timeline[priorIndex] = {
    ...previous,
    streaming: false,
    cursor: event.cursor,
    createdAt: view.createdAt
  };
}

function appendApprovalEvent(
  context: NormalizationContext,
  event: ChatEvent,
  view: EventView
): void {
  const approvalLabel =
    view.method === "approval.requested" ? "Approval requested" : "Approval resolved";
  context.timeline.push({
    id: `evt-${event.cursor}`,
    kind: "approval",
    label: approvalLabel,
    detail: null,
    turnId: view.turnId,
    cursor: event.cursor,
    createdAt: view.createdAt
  });
}

function appendItemLifecycle(
  context: NormalizationContext,
  event: ChatEvent,
  view: EventView
): void {
  const lifecycleLabel = view.method === "item.started" ? "Item started" : "Item completed";
  context.timeline.push({
    id: `evt-${event.cursor}`,
    kind: "runtime",
    label: lifecycleLabel,
    detail: readItemLifecycleDetail(event.payload),
    payload: event.payload,
    turnId: view.turnId,
    cursor: event.cursor,
    createdAt: view.createdAt
  });
}

function appendRuntimeDataPart(
  context: NormalizationContext,
  event: ChatEvent,
  view: EventView
): boolean {
  const runtimeDataPart = parseRuntimeDataPart({
    method: view.method,
    payload: event.payload
  });
  if (!runtimeDataPart) {
    return false;
  }

  upsertAssistantMessage({
    timeline: context.timeline,
    assistantMessageByTurn: context.assistantMessageByTurn,
    turnId: view.turnId,
    cursor: event.cursor,
    createdAt: view.createdAt,
    parts: [runtimeDataPart]
  });
  return true;
}

function appendErrorEvent(context: NormalizationContext, event: ChatEvent, view: EventView): void {
  context.timeline.push({
    id: `evt-${event.cursor}`,
    kind: "status",
    label: "Error",
    detail: readText(readPayloadObject(event.payload)?.message),
    turnId: view.turnId,
    cursor: event.cursor,
    createdAt: view.createdAt
  });
}

function appendUnknownEvent(
  context: NormalizationContext,
  event: ChatEvent,
  view: EventView
): void {
  context.timeline.push({
    id: `evt-${event.cursor}`,
    kind: "unknown",
    label: formatEventLabel(view.method),
    payload: event.payload,
    turnId: view.turnId,
    cursor: event.cursor,
    createdAt: view.createdAt
  });
}

function normalizeSingleEvent(context: NormalizationContext, event: ChatEvent): void {
  const view = getEventView(event);
  if (view.method === "turn.started") {
    appendUserTurnStarted(context, event, view);
    return;
  }

  if (view.method === "item.delta") {
    appendItemDelta(context, event, view);
    return;
  }

  if (view.method === "turn.completed") {
    markTurnCompleted(context, event, view);
    return;
  }

  if (view.method === "approval.requested" || view.method === "approval.resolved") {
    appendApprovalEvent(context, event, view);
    return;
  }

  if (view.method === "item.started" || view.method === "item.completed") {
    appendItemLifecycle(context, event, view);
    return;
  }

  if (appendRuntimeDataPart(context, event, view)) {
    return;
  }

  if (view.method === "thread.started" || view.method === "thread.modeSwitched") {
    return;
  }

  if (view.method === "error") {
    appendErrorEvent(context, event, view);
    return;
  }

  appendUnknownEvent(context, event, view);
}

export function normalizeChatEvents(events: readonly ChatEvent[]): ChatTimelineItem[] {
  const sorted = [...events].sort((left, right) => left.cursor - right.cursor);
  const context: NormalizationContext = {
    timeline: [],
    assistantMessageByTurn: new Map<string, number>()
  };

  for (const event of sorted) {
    normalizeSingleEvent(context, event);
  }

  return context.timeline;
}
