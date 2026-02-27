import type { AgentEvent } from "~/features/chat/agent-types";

export interface AgentEventMergeResult {
  events: AgentEvent[];
  nextCursor: number;
}

export function mergeAgentEvents(
  existingEvents: readonly AgentEvent[],
  incomingEvents: readonly AgentEvent[]
): AgentEventMergeResult {
  const byCursor = new Map<number, AgentEvent>();

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
