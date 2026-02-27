import { listAgentThreadEventsClient, parseStreamEventPayload } from "~/features/chat/agent-client";
import type { AgentEvent, ChatTransportState } from "~/features/chat/agent-types";

export interface AgentTransportOptions {
  threadId: string;
  initialCursor?: number;
  pollIntervalMs?: number;
  onEvent: (event: AgentEvent) => void;
  onStateChange: (state: ChatTransportState) => void;
}

export interface AgentTransportHandle {
  stop: () => void;
}

function createWebSocketUrl(threadId: string, cursor: number): string {
  const url = new URL(
    `/v1/agent/threads/${encodeURIComponent(threadId)}/stream`,
    window.location.origin
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("cursor", String(cursor));
  return url.toString();
}

export function startAgentTransport(options: AgentTransportOptions): AgentTransportHandle {
  const seenCursors = new Set<number>();
  let reconnectCount = 0;
  let cursor = Math.max(0, options.initialCursor ?? 0);
  let lifecycle: ChatTransportState["lifecycle"] = "idle";
  let lastError: string | null = null;
  let pollTimer: number | null = null;
  let websocket: WebSocket | null = null;
  let closed = false;

  const emitState = () => {
    options.onStateChange({
      lifecycle,
      cursor,
      reconnectCount,
      lastError
    });
  };

  const applyEvent = (event: AgentEvent) => {
    if (seenCursors.has(event.cursor)) {
      return;
    }

    seenCursors.add(event.cursor);
    cursor = Math.max(cursor, event.cursor);
    options.onEvent(event);
    emitState();
  };

  const schedulePoll = (delayMs: number) => {
    if (closed) {
      return;
    }

    if (pollTimer !== null) {
      window.clearTimeout(pollTimer);
      pollTimer = null;
    }

    pollTimer = window.setTimeout(() => {
      void pollEvents();
    }, delayMs);
  };

  const pollEvents = async () => {
    if (closed) {
      return;
    }

    try {
      const result = await listAgentThreadEventsClient({
        threadId: options.threadId,
        cursor,
        limit: 200
      });

      for (const event of result.events) {
        applyEvent(event);
      }

      cursor = Math.max(cursor, result.nextCursor);
      lastError = null;
      lifecycle = "polling";
      emitState();
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unable to poll chat events.";
      lifecycle = "error";
      emitState();
    } finally {
      schedulePoll(options.pollIntervalMs ?? 1500);
    }
  };

  const connectWebSocket = () => {
    if (closed) {
      return;
    }

    lifecycle = "connecting";
    emitState();

    try {
      websocket = new WebSocket(createWebSocketUrl(options.threadId, cursor));
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unable to open chat stream.";
      lifecycle = "error";
      emitState();
      schedulePoll(300);
      return;
    }

    websocket.onopen = () => {
      if (closed) {
        return;
      }

      lifecycle = "open";
      lastError = null;
      emitState();
    };

    websocket.onmessage = (messageEvent) => {
      if (closed) {
        return;
      }

      try {
        const parsed = JSON.parse(String(messageEvent.data)) as unknown;
        const event = parseStreamEventPayload(parsed);
        if (event) {
          applyEvent(event);
        }
      } catch {
        // Ignore malformed websocket payloads and continue.
      }
    };

    websocket.onerror = () => {
      if (closed) {
        return;
      }

      lastError = "Chat stream disconnected. Switching to event polling.";
      lifecycle = "polling";
      emitState();
      schedulePoll(150);
    };

    websocket.onclose = () => {
      websocket = null;
      if (closed) {
        return;
      }

      reconnectCount += 1;
      lifecycle = "polling";
      emitState();
      schedulePoll(150);
    };
  };

  connectWebSocket();

  return {
    stop: () => {
      closed = true;
      lifecycle = "closed";
      emitState();

      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }

      if (websocket) {
        websocket.close();
      }
    }
  };
}
