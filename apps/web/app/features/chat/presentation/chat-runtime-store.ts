import type { ThreadMessageLike } from "@assistant-ui/react";
import type { ChatTimelineItem, ChatTransportState } from "~/features/chat/agent-types";

export type ChatInspectTab = "activity" | "terminal" | "files" | "diff" | "raw";

export interface ChatInspectState {
  cursor: number | null;
  tab: ChatInspectTab;
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

export function buildAssistantStoreMessages({
  timeline
}: {
  timeline: ChatTimelineItem[];
}): AssistantStoreMessage[] {
  return timeline
    .filter((item) => item.kind === "message" || item.kind === "status")
    .map((item) => {
      if (item.kind === "message") {
        return {
          id: item.id,
          role: item.role,
          text: item.text,
          turnId: item.turnId,
          cursor: item.cursor,
          createdAt: item.createdAt,
          streaming: item.streaming
        } satisfies AssistantStoreMessage;
      }

      return {
        id: item.id,
        role: "assistant",
        text: [item.label, item.detail].filter(Boolean).join("\n"),
        turnId: item.turnId,
        cursor: item.cursor,
        createdAt: item.createdAt,
        streaming: false
      } satisfies AssistantStoreMessage;
    });
}

export function convertAssistantStoreMessage(message: AssistantStoreMessage): ThreadMessageLike {
  const metadata = {
    custom: {
      cursor: message.cursor,
      turnId: message.turnId
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
