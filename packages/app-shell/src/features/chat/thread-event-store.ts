import type { ChatEvent } from "~/features/chat/thread-types";

export interface ChatEventMergeResult {
  events: ChatEvent[];
  nextCursor: number;
}

export function mergeChatEvents(
  existingEvents: readonly ChatEvent[],
  incomingEvents: readonly ChatEvent[]
): ChatEventMergeResult {
  const byCursor = new Map<number, ChatEvent>();

  for (const event of existingEvents) {
    byCursor.set(event.cursor, event);
  }

  for (const event of incomingEvents) {
    byCursor.set(event.cursor, event);
  }

  const events = [...byCursor.values()].sort((left, right) => left.cursor - right.cursor);
  const nextCursor = events.reduce((cursor, event) => Math.max(cursor, event.cursor), 0);

  return {
    events,
    nextCursor
  };
}
