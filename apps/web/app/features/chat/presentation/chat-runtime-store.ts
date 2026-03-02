import type { ThreadMessageLike } from "@assistant-ui/react";
import type { ChatTimelineItem, ChatTransportState } from "~/features/chat/agent-types";

export type ChatInspectTab = "activity" | "terminal" | "files" | "diff" | "raw";

export interface ChatInspectState {
  cursor: number | null;
  tab: ChatInspectTab;
}

export interface AssistantEventPartModel {
  kind: "status" | "runtime" | "approval" | "unknown";
  label: string;
  detail: string | null;
  payload?: unknown;
  cursor: number | null;
  defaultTab: ChatInspectTab;
}

export interface AssistantThreadListItem {
  status: "regular" | "archived";
  id: string;
  title: string;
}

export interface AssistantStoreMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  turnId: string | null;
  cursor: number | null;
  createdAt: string | null;
  streaming: boolean;
  eventPart: AssistantEventPartModel | null;
}

export interface ChatSurfaceState {
  transportLifecycle: ChatTransportState["lifecycle"];
  transportLabel: string;
  actionError: string | null;
  transportError: string | null;
}

function readDateFromIso(value: string | null): Date {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function resolveInspectTab(item: Exclude<ChatTimelineItem, { kind: "message" }>): ChatInspectTab {
  if (item.kind === "runtime") {
    return "activity";
  }

  if (item.kind === "unknown") {
    return "raw";
  }

  return "activity";
}

function buildEventPartModel(
  item: Exclude<ChatTimelineItem, { kind: "message" }>
): AssistantEventPartModel {
  const detail = "detail" in item ? (item.detail ?? null) : null;
  const payload = "payload" in item ? item.payload : undefined;

  return {
    kind: item.kind,
    label: item.label,
    detail,
    payload,
    cursor: item.cursor,
    defaultTab: resolveInspectTab(item)
  };
}

function buildEventMessageText(eventPart: AssistantEventPartModel): string {
  return [eventPart.label, eventPart.detail]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function isAssistantEventPartModel(value: unknown): value is AssistantEventPartModel {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  const defaultTab = candidate.defaultTab;

  if (kind !== "status" && kind !== "runtime" && kind !== "approval" && kind !== "unknown") {
    return false;
  }

  if (
    defaultTab !== "activity" &&
    defaultTab !== "terminal" &&
    defaultTab !== "files" &&
    defaultTab !== "diff" &&
    defaultTab !== "raw"
  ) {
    return false;
  }

  if (typeof candidate.label !== "string") {
    return false;
  }

  return true;
}

export function readAssistantEventPartFromMetadata(
  metadata: unknown
): AssistantEventPartModel | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const custom = (metadata as { custom?: unknown }).custom;
  if (!custom || typeof custom !== "object") {
    return null;
  }

  const eventPart = (custom as { eventPart?: unknown }).eventPart;
  return isAssistantEventPartModel(eventPart) ? eventPart : null;
}

export function buildAssistantStoreMessages({
  timeline
}: {
  timeline: ChatTimelineItem[];
}): AssistantStoreMessage[] {
  const assistantMessages = timeline.map((item) => {
    if (item.kind === "message") {
      return {
        id: item.id,
        role: item.role,
        text: item.text,
        turnId: item.turnId,
        cursor: item.cursor,
        createdAt: item.createdAt,
        streaming: item.streaming,
        eventPart: null
      } satisfies AssistantStoreMessage;
    }

    const eventPart = buildEventPartModel(item);

    return {
      id: item.id,
      role: "assistant",
      text: buildEventMessageText(eventPart),
      turnId: item.turnId,
      cursor: item.cursor,
      createdAt: item.createdAt,
      streaming: false,
      eventPart
    } satisfies AssistantStoreMessage;
  });

  return assistantMessages;
}

export function convertAssistantStoreMessage(message: AssistantStoreMessage): ThreadMessageLike {
  const metadata = {
    custom: {
      cursor: message.cursor,
      turnId: message.turnId,
      eventPart: message.eventPart
    }
  };

  if (message.role === "assistant") {
    const content = [
      {
        type: "text" as const,
        text: message.text
      }
    ];

    return {
      id: message.id,
      role: "assistant",
      content,
      createdAt: readDateFromIso(message.createdAt),
      status: message.streaming ? { type: "running" } : { type: "complete", reason: "stop" },
      metadata
    };
  }

  return {
    id: message.id,
    role: "user",
    content: [
      {
        type: "text" as const,
        text: message.text
      }
    ],
    createdAt: readDateFromIso(message.createdAt),
    metadata
  };
}

export function buildAssistantThreadListItems(
  items: Array<{ threadId: string; title: string; archived?: boolean }>
): AssistantThreadListItem[] {
  return items.map((item) => ({
    status: item.archived ? "archived" : "regular",
    id: item.threadId,
    title: item.title
  }));
}
