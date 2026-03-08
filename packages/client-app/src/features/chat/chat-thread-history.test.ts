import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __private__,
  readChatThreadHistory,
  subscribeChatThreadHistory,
  upsertChatThreadHistoryItem
} from "~/features/chat/chat-thread-history";

class MemoryStorage implements Storage {
  #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  clear(): void {
    this.#values.clear();
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat thread history", () => {
  it("reads and normalizes stored items while ignoring malformed records", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      __private__.CHAT_THREAD_HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          threadId: "thread-1",
          workspaceSlug: "workspace-a",
          title: "  First title ",
          executionMode: "local",
          status: "completed",
          updatedAt: "2026-01-01T00:00:10.000Z"
        },
        {
          threadId: "thread-2",
          workspaceSlug: "workspace-a",
          title: "Second title",
          executionMode: "cloud",
          status: "idle",
          updatedAt: "2026-01-01T00:00:20.000Z"
        },
        {
          threadId: "",
          workspaceSlug: "workspace-a",
          title: "Missing id",
          updatedAt: "2026-01-01T00:00:30.000Z"
        }
      ])
    );

    const items = readChatThreadHistory(storage);
    expect(items).toHaveLength(2);
    expect(items[0]?.threadId).toBe("thread-2");
    expect(items[1]?.executionMode).toBe("local");
  });

  it("returns an empty list when storage is unavailable or invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem(__private__.CHAT_THREAD_HISTORY_STORAGE_KEY, "not-json");

    expect(readChatThreadHistory(null)).toEqual([]);
    expect(readChatThreadHistory(storage)).toEqual([]);
  });

  it("upserts items, trims history to limit, and dispatches update events", () => {
    const storage = new MemoryStorage();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    for (let index = 0; index < __private__.CHAT_THREAD_HISTORY_LIMIT + 5; index += 1) {
      upsertChatThreadHistoryItem(
        {
          threadId: `thread-${index.toString()}`,
          workspaceSlug: "workspace-a",
          title: `Thread ${index.toString()}`,
          executionMode: "cloud",
          status: "idle",
          updatedAt: `2026-01-01T00:00:${index.toString().padStart(2, "0")}.000Z`
        },
        storage
      );
    }

    const items = readChatThreadHistory(storage);
    expect(items).toHaveLength(__private__.CHAT_THREAD_HISTORY_LIMIT);
    expect(items[0]?.threadId).toBe("thread-44");
    expect(items.at(-1)?.threadId).toBe("thread-5");
    expect(dispatchSpy).toHaveBeenCalled();
  });

  it("subscribes to in-page and storage update events", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeChatThreadHistory(listener);

    window.dispatchEvent(new Event(__private__.CHAT_THREAD_HISTORY_UPDATED_EVENT));
    expect(listener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: __private__.CHAT_THREAD_HISTORY_STORAGE_KEY
      })
    );
    expect(listener).toHaveBeenCalledTimes(2);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "different-key"
      })
    );
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new Event(__private__.CHAT_THREAD_HISTORY_UPDATED_EVENT));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
