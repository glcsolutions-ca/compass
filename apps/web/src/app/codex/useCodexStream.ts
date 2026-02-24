"use client";

import { useEffect } from "react";
import type { StreamEvent } from "@compass/contracts";
import { parseStreamEventMessage } from "./stream-state.js";

export function useCodexStream(
  threadId: string | null,
  wsBaseUrl: string,
  onEvent: (event: StreamEvent) => void,
  onStatus?: (status: "connecting" | "open" | "closed" | "error") => void
) {
  useEffect(() => {
    if (!threadId) {
      return;
    }

    const normalized = wsBaseUrl.replace(/\/+$/, "");
    const ws = new WebSocket(`${normalized}/v1/stream?threadId=${encodeURIComponent(threadId)}`);

    onStatus?.("connecting");

    ws.onopen = () => {
      onStatus?.("open");
    };

    ws.onclose = () => {
      onStatus?.("closed");
    };

    ws.onerror = () => {
      onStatus?.("error");
    };

    ws.onmessage = (message) => {
      const parsed = parseStreamEventMessage(message.data);
      if (parsed) {
        onEvent(parsed);
      }
    };

    return () => {
      ws.close();
    };
  }, [threadId, wsBaseUrl, onEvent, onStatus]);
}
