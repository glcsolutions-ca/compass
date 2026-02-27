import type { AgentExecutionMode, AgentThreadStatus } from "~/features/chat/agent-types";

const CHAT_THREAD_HISTORY_STORAGE_KEY = "compass-chat-thread-history-v1";
const CHAT_THREAD_HISTORY_LIMIT = 40;

export interface ChatThreadHistoryItem {
  threadId: string;
  workspaceSlug: string;
  title: string;
  executionMode: AgentExecutionMode;
  status: AgentThreadStatus;
  updatedAt: string;
}

function canUseStorage(storage: Storage | null): storage is Storage {
  return storage !== null;
}

function normalizeItem(candidate: unknown): ChatThreadHistoryItem | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const raw = candidate as Record<string, unknown>;
  const threadId = typeof raw.threadId === "string" ? raw.threadId.trim() : "";
  const workspaceSlug = typeof raw.workspaceSlug === "string" ? raw.workspaceSlug.trim() : "";
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const executionMode = raw.executionMode === "local" ? "local" : "cloud";
  const status =
    raw.status === "idle" ||
    raw.status === "inProgress" ||
    raw.status === "completed" ||
    raw.status === "interrupted" ||
    raw.status === "error"
      ? raw.status
      : "idle";
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt.trim() : "";

  if (!threadId || !workspaceSlug || !title || !updatedAt) {
    return null;
  }

  return {
    threadId,
    workspaceSlug,
    title,
    executionMode,
    status,
    updatedAt
  };
}

function readStorageValue(storage: Storage): string | null {
  try {
    return storage.getItem(CHAT_THREAD_HISTORY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorageValue(storage: Storage, value: string): void {
  try {
    storage.setItem(CHAT_THREAD_HISTORY_STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures in restricted browser contexts.
  }
}

export function readChatThreadHistory(
  storage: Storage | null = globalThis.localStorage
): ChatThreadHistoryItem[] {
  if (!canUseStorage(storage)) {
    return [];
  }

  const raw = readStorageValue(storage);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeItem(item))
      .filter((item): item is ChatThreadHistoryItem => item !== null)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  } catch {
    return [];
  }
}

export function upsertChatThreadHistoryItem(
  item: Omit<ChatThreadHistoryItem, "updatedAt"> & { updatedAt?: string },
  storage: Storage | null = globalThis.localStorage
): ChatThreadHistoryItem[] {
  if (!canUseStorage(storage)) {
    return [];
  }

  const updatedAt = item.updatedAt ?? new Date().toISOString();
  const existing = readChatThreadHistory(storage).filter(
    (entry) => entry.threadId !== item.threadId
  );
  const next: ChatThreadHistoryItem[] = [
    {
      threadId: item.threadId,
      workspaceSlug: item.workspaceSlug,
      title: item.title,
      executionMode: item.executionMode,
      status: item.status,
      updatedAt
    },
    ...existing
  ].slice(0, CHAT_THREAD_HISTORY_LIMIT);

  writeStorageValue(storage, JSON.stringify(next));
  return next;
}

export const __private__ = {
  CHAT_THREAD_HISTORY_STORAGE_KEY,
  CHAT_THREAD_HISTORY_LIMIT
};
