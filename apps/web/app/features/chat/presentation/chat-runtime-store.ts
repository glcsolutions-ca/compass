import type { ThreadMessageLike } from "@assistant-ui/react";
import type {
  ChatTimelineItem,
  ChatTimelineMessagePart,
  ChatTransportState
} from "~/features/chat/agent-types";

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

export type AssistantStoreMessagePart = ChatTimelineMessagePart;

export interface AssistantStoreMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  parts?: AssistantStoreMessagePart[];
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

type ThreadMessagePartLike = Exclude<ThreadMessageLike["content"], string>[number];

function readDateFromIso(value: string | null): Date {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toThreadMessagePart(part: AssistantStoreMessagePart): ThreadMessagePartLike {
  if (part.type === "text" || part.type === "reasoning") {
    return {
      type: part.type,
      text: part.text,
      parentId: part.parentId
    };
  }

  if (part.type === "tool-call") {
    return {
      type: "tool-call",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      args: part.args,
      argsText: part.argsText,
      result: part.result,
      isError: part.isError,
      parentId: part.parentId
    };
  }

  return {
    type: "data",
    name: part.name,
    data: part.data
  };
}

function convertAssistantParts(
  parts: readonly AssistantStoreMessagePart[] | undefined
): ThreadMessagePartLike[] {
  if (!parts || parts.length < 1) {
    return [];
  }

  return parts.map((part) => toThreadMessagePart(part));
}

function convertUserParts(
  parts: readonly AssistantStoreMessagePart[] | undefined,
  textFallback: string
): Array<{ type: "text"; text: string }> {
  if (!parts || parts.length < 1) {
    return [
      {
        type: "text",
        text: textFallback
      }
    ];
  }

  const userTextParts = parts
    .filter(
      (part): part is Extract<AssistantStoreMessagePart, { type: "text" }> => part.type === "text"
    )
    .map((part) => ({
      type: "text" as const,
      text: part.text
    }));

  if (userTextParts.length > 0) {
    return userTextParts;
  }

  return [
    {
      type: "text",
      text: textFallback
    }
  ];
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
          parts:
            item.parts.length > 0
              ? item.parts
              : [
                  {
                    type: "text" as const,
                    text: item.text
                  }
                ],
          turnId: item.turnId,
          cursor: item.cursor,
          createdAt: item.createdAt,
          streaming: item.streaming
        } satisfies AssistantStoreMessage;
      }

      const statusText = [item.label, item.detail].filter(Boolean).join("\n");
      return {
        id: item.id,
        role: "assistant",
        text: statusText,
        parts: [
          {
            type: "text",
            text: statusText
          }
        ],
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
    const content = convertAssistantParts(message.parts);

    return {
      id: message.id,
      role: "assistant",
      content:
        content.length > 0
          ? content
          : [
              {
                type: "text",
                text: message.text
              }
            ],
      createdAt: readDateFromIso(message.createdAt),
      status: message.streaming ? { type: "running" } : { type: "complete", reason: "stop" },
      metadata
    };
  }

  return {
    id: message.id,
    role: "user",
    content: convertUserParts(message.parts, message.text),
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
