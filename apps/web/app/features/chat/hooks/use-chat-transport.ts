import { useEffect, useState } from "react";
import { mergeAgentEvents, type AgentEventMergeResult } from "~/features/chat/agent-event-store";
import { startAgentTransport } from "~/features/chat/agent-transport";
import type { AgentEvent, ChatTransportState } from "~/features/chat/agent-types";

interface UseChatTransportInput {
  activeThreadId: string | null;
  initialCursor: number;
  initialEvents: readonly AgentEvent[];
}

interface UseChatTransportOutput {
  eventState: AgentEventMergeResult;
  transportState: ChatTransportState;
}

export function useChatTransport({
  activeThreadId,
  initialCursor,
  initialEvents
}: UseChatTransportInput): UseChatTransportOutput {
  const [eventState, setEventState] = useState<AgentEventMergeResult>(() =>
    mergeAgentEvents([], initialEvents)
  );
  const [transportState, setTransportState] = useState<ChatTransportState>({
    lifecycle: "idle",
    cursor: initialCursor,
    reconnectCount: 0,
    lastError: null
  });

  useEffect(() => {
    setEventState(mergeAgentEvents([], initialEvents));
    setTransportState({
      lifecycle: activeThreadId ? "connecting" : "idle",
      cursor: initialCursor,
      reconnectCount: 0,
      lastError: null
    });
  }, [activeThreadId, initialCursor, initialEvents]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }

    const handle = startAgentTransport({
      threadId: activeThreadId,
      initialCursor,
      onEvent: (event) => {
        setEventState((current) => mergeAgentEvents(current.events, [event]));
      },
      onStateChange: setTransportState
    });

    return () => {
      handle.stop();
    };
  }, [activeThreadId, initialCursor]);

  return {
    eventState,
    transportState
  };
}
