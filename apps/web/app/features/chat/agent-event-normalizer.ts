import type { AgentEvent, ChatTimelineItem } from "~/features/chat/agent-types";

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

function readDeltaText(payload: unknown): string | null {
  const data = readPayloadObject(payload);
  if (!data) {
    return null;
  }

  if (typeof data.text === "string" && data.text.length > 0) {
    return data.text;
  }

  const content = data.content;
  if (Array.isArray(content)) {
    const segments = content
      .map((segment) => {
        if (!segment || typeof segment !== "object") {
          return "";
        }

        const segmentText = (segment as { text?: unknown }).text;
        return typeof segmentText === "string" ? segmentText : "";
      })
      .join("");
    return segments.length > 0 ? segments : null;
  }

  return null;
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

export function normalizeAgentEvents(events: readonly AgentEvent[]): ChatTimelineItem[] {
  const sorted = [...events].sort((left, right) => left.cursor - right.cursor);
  const timeline: ChatTimelineItem[] = [];
  const assistantMessageByTurnId = new Map<string, number>();

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
          turnId,
          cursor: event.cursor,
          streaming: false,
          createdAt
        });
      }
      continue;
    }

    if (method === "item.delta") {
      const deltaText = readDeltaText(event.payload);
      if (!deltaText) {
        continue;
      }

      const assistantTurnKey = turnId ?? `cursor:${event.cursor.toString()}`;
      const priorIndex = assistantMessageByTurnId.get(assistantTurnKey);
      if (priorIndex !== undefined) {
        const previous = timeline[priorIndex];
        if (previous && previous.kind === "message" && previous.role === "assistant") {
          timeline[priorIndex] = {
            ...previous,
            text: `${previous.text}${deltaText}`,
            cursor: event.cursor,
            createdAt,
            streaming: true
          };
          continue;
        }
      }

      const nextIndex = timeline.length;
      timeline.push({
        id: `evt-${event.cursor}`,
        kind: "message",
        role: "assistant",
        text: deltaText,
        turnId,
        cursor: event.cursor,
        streaming: true,
        createdAt
      });
      assistantMessageByTurnId.set(assistantTurnKey, nextIndex);
      continue;
    }

    if (method === "turn.completed") {
      if (turnId) {
        const priorIndex = assistantMessageByTurnId.get(turnId);
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

    if (method === "runtime.metadata" || method.startsWith("runtime.")) {
      timeline.push({
        id: `evt-${event.cursor}`,
        kind: "runtime",
        label: method === "runtime.metadata" ? "Runtime metadata" : label,
        detail: readRuntimeDetail(event.payload),
        payload: event.payload,
        turnId,
        cursor: event.cursor,
        createdAt
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
