import { useEffect, useState } from "react";
import { mergeChatEvents, type ChatEventMergeResult } from "~/features/chat/thread-event-store";
import { startThreadTransport } from "~/features/chat/thread-transport";
import type { ChatEvent, ChatTransportState } from "~/features/chat/thread-types";

interface UseChatTransportInput {
  activeThreadId: string | null;
  initialCursor: number;
  initialEvents: readonly ChatEvent[];
}

interface UseChatTransportOutput {
  eventState: ChatEventMergeResult;
  transportState: ChatTransportState;
}

export function useChatTransport({
  activeThreadId,
  initialCursor,
  initialEvents
}: UseChatTransportInput): UseChatTransportOutput {
  const [eventState, setEventState] = useState<ChatEventMergeResult>(() =>
    mergeChatEvents([], initialEvents)
  );
  const [transportState, setTransportState] = useState<ChatTransportState>({
    lifecycle: "idle",
    cursor: initialCursor,
    reconnectCount: 0,
    lastError: null
  });

  useEffect(() => {
    setEventState(mergeChatEvents([], initialEvents));
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

    const handle = startThreadTransport({
      threadId: activeThreadId,
      initialCursor,
      onEvent: (event) => {
        setEventState((current) => mergeChatEvents(current.events, [event]));
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
