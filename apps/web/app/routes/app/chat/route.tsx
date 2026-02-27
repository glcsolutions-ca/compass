import { useExternalStoreRuntime, type AppendMessage } from "@assistant-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";
import type { MetaFunction } from "react-router";
import type { ShellRouteHandle } from "~/features/auth/types";
import { normalizeAgentEvents } from "~/features/chat/agent-event-normalizer";
import { mergeAgentEvents } from "~/features/chat/agent-event-store";
import { startAgentTransport } from "~/features/chat/agent-transport";
import type {
  AgentExecutionMode,
  ChatTimelineItem,
  ChatTransportState
} from "~/features/chat/agent-types";
import type { ChatActionData } from "~/features/chat/chat-action";
import { submitChatAction } from "~/features/chat/chat-action";
import { ChatCanvas } from "~/features/chat/presentation/chat-canvas";
import {
  buildChatInspectSearchParams,
  ChatInspectDrawer,
  parseChatInspectState
} from "~/features/chat/presentation/chat-inspect-drawer";
import {
  buildAssistantStoreMessages,
  convertAssistantStoreMessage,
  type ChatInspectState,
  type ChatSurfaceState
} from "~/features/chat/presentation/chat-runtime-store";
import type { ChatLoaderData } from "~/features/chat/chat-loader";
import { loadChatData } from "~/features/chat/chat-loader";
import { upsertChatThreadHistoryItem } from "~/features/chat/chat-thread-history";
import { buildThreadHref } from "~/features/chat/new-thread-routing";

interface TimelinePromptRecord {
  id: string;
  turnId: string | null;
  text: string;
  createdAt: string;
}

interface TransportSummary {
  lifecycle: ChatTransportState["lifecycle"];
  label: string;
}

function sortTimelineByCursorOrTime(
  left: Pick<ChatTimelineItem, "cursor" | "createdAt">,
  right: Pick<ChatTimelineItem, "cursor" | "createdAt">
): number {
  if (left.cursor !== null && right.cursor !== null) {
    return left.cursor - right.cursor;
  }

  const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
  const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
  return leftTime - rightTime;
}

function readTransportSummary(state: ChatTransportState): TransportSummary {
  if (state.lifecycle === "polling") {
    return {
      lifecycle: state.lifecycle,
      label: "Polling"
    };
  }

  if (state.lifecycle === "open") {
    return {
      lifecycle: state.lifecycle,
      label: "Live"
    };
  }

  if (state.lifecycle === "connecting") {
    return {
      lifecycle: state.lifecycle,
      label: "Connecting"
    };
  }

  if (state.lifecycle === "error") {
    return {
      lifecycle: state.lifecycle,
      label: "Error"
    };
  }

  return {
    lifecycle: state.lifecycle,
    label: "Idle"
  };
}

function readSubmittingPromptValue(formData: FormData | undefined): string | null {
  if (!formData) {
    return null;
  }

  const prompt = formData.get("prompt");
  if (typeof prompt !== "string") {
    return null;
  }

  const normalized = prompt.trim();
  return normalized.length > 0 ? normalized : null;
}

function readAppendMessagePrompt(message: AppendMessage): string | null {
  const combined = message.content
    .map((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return part.text;
      }
      return "";
    })
    .join("\n")
    .trim();

  return combined.length > 0 ? combined : null;
}

function isDesktopLocalModeAvailable(): boolean {
  const desktopCandidate = (window as { compassDesktop?: unknown }).compassDesktop;
  if (!desktopCandidate || typeof desktopCandidate !== "object") {
    return false;
  }

  const runtime = desktopCandidate as { isDesktop?: () => boolean };
  return typeof runtime.isDesktop === "function" ? runtime.isDesktop() : false;
}

export const meta: MetaFunction<typeof clientLoader> = ({ params }) => {
  const threadId = params.threadId?.trim();
  return [{ title: threadId ? `Compass Chat · ${threadId.slice(0, 8)}` : "Compass Chat" }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  navLabel: "Chat",
  shellLayout: "immersive"
};

export async function clientLoader({
  request,
  params
}: {
  request: Request;
  params: { threadId?: string };
}): Promise<ChatLoaderData | Response> {
  return loadChatData({
    request,
    threadId: params.threadId
  });
}

export async function clientAction({
  request,
  params
}: {
  request: Request;
  params: { threadId?: string };
}): Promise<Response | ChatActionData> {
  return submitChatAction({
    request,
    threadId: params.threadId
  });
}

export default function ChatRoute() {
  const loaderData = useLoaderData<ChatLoaderData>();
  const location = useLocation();
  const navigate = useNavigate();
  const submitFetcher = useFetcher<ChatActionData>();
  const modeFetcher = useFetcher<ChatActionData>();
  const interruptFetcher = useFetcher<ChatActionData>();
  const [executionMode, setExecutionMode] = useState<AgentExecutionMode>(loaderData.executionMode);
  const [transportState, setTransportState] = useState<ChatTransportState>({
    lifecycle: "idle",
    cursor: loaderData.initialCursor,
    reconnectCount: 0,
    lastError: null
  });
  const [timelinePrompts, setTimelinePrompts] = useState<TimelinePromptRecord[]>([]);
  const [eventState, setEventState] = useState(() =>
    mergeAgentEvents([], loaderData.initialEvents)
  );
  const [localModeAvailable] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return isDesktopLocalModeAvailable();
  });

  const activeThreadId = submitFetcher.data?.threadId ?? loaderData.threadId;
  const transportSummary = readTransportSummary(transportState);

  useEffect(() => {
    setExecutionMode(loaderData.executionMode);
  }, [loaderData.executionMode, loaderData.threadId]);

  useEffect(() => {
    setEventState(mergeAgentEvents([], loaderData.initialEvents));
    setTransportState({
      lifecycle: loaderData.threadId ? "connecting" : "idle",
      cursor: loaderData.initialCursor,
      reconnectCount: 0,
      lastError: null
    });
  }, [loaderData.initialCursor, loaderData.initialEvents, loaderData.threadId]);

  useEffect(() => {
    if (!activeThreadId) {
      return;
    }

    const handle = startAgentTransport({
      threadId: activeThreadId,
      initialCursor: loaderData.initialCursor,
      onEvent: (event) => {
        setEventState((current) => mergeAgentEvents(current.events, [event]));
      },
      onStateChange: setTransportState
    });

    return () => {
      handle.stop();
    };
  }, [activeThreadId, loaderData.initialCursor]);

  useEffect(() => {
    const actionResult = submitFetcher.data;
    if (!actionResult || actionResult.intent !== "sendMessage" || !actionResult.ok) {
      return;
    }

    if (actionResult.threadId && actionResult.threadId !== loaderData.threadId) {
      void navigate(buildThreadHref(actionResult.threadId), { replace: true });
    }

    const promptText = actionResult.prompt;
    if (promptText) {
      setTimelinePrompts((current) => {
        const alreadyExists = current.some(
          (record) => record.turnId === actionResult.turnId && record.text === promptText
        );
        if (alreadyExists) {
          return current;
        }

        return [
          ...current,
          {
            id: `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            turnId: actionResult.turnId,
            text: promptText,
            createdAt: new Date().toISOString()
          }
        ];
      });
    }

    if (actionResult.threadId) {
      const title =
        actionResult.prompt?.slice(0, 80) || `Thread ${actionResult.threadId.slice(0, 8)}`;
      upsertChatThreadHistoryItem({
        threadId: actionResult.threadId,
        title,
        executionMode: actionResult.executionMode,
        status: "inProgress"
      });
    }
  }, [loaderData.threadId, navigate, submitFetcher.data]);

  const timeline = useMemo(() => {
    const normalized = normalizeAgentEvents(eventState.events);
    const userTurnsFromEvents = new Set(
      normalized
        .filter((item) => item.kind === "message" && item.role === "user")
        .map((item) => item.turnId)
        .filter((turnId): turnId is string => typeof turnId === "string" && turnId.length > 0)
    );

    const promptFallbackItems: ChatTimelineItem[] = timelinePrompts
      .filter((record) => !record.turnId || !userTurnsFromEvents.has(record.turnId))
      .map((record) => ({
        id: record.id,
        kind: "message",
        role: "user",
        text: record.text,
        turnId: record.turnId,
        cursor: null,
        streaming: false,
        createdAt: record.createdAt
      }));

    return [...promptFallbackItems, ...normalized].sort(sortTimelineByCursorOrTime);
  }, [eventState.events, timelinePrompts]);

  const activeTurnId = useMemo(() => {
    const turnStatus = new Map<string, "active" | "completed" | "interrupted" | "error">();
    for (const event of eventState.events) {
      if (!event.turnId) {
        continue;
      }

      if (event.method === "turn.started") {
        turnStatus.set(event.turnId, "active");
      } else if (event.method === "turn.completed") {
        turnStatus.set(event.turnId, "completed");
      } else if (event.method === "error") {
        turnStatus.set(event.turnId, "error");
      } else if (event.method.includes("interrupt")) {
        turnStatus.set(event.turnId, "interrupted");
      }
    }

    const activeTurns = [...turnStatus.entries()].filter((entry) => entry[1] === "active");
    return activeTurns.length > 0 ? (activeTurns[activeTurns.length - 1]?.[0] ?? null) : null;
  }, [eventState.events]);

  const submittingPromptValue = useMemo(
    () => readSubmittingPromptValue(submitFetcher.formData),
    [submitFetcher.formData]
  );

  const assistantMessages = useMemo(
    () =>
      buildAssistantStoreMessages({
        timeline,
        pendingPrompt: submitFetcher.state !== "idle" ? submittingPromptValue : null
      }),
    [submitFetcher.state, submittingPromptValue, timeline]
  );

  const handleAssistantSend = useCallback(
    async (message: AppendMessage): Promise<void> => {
      if (submitFetcher.state !== "idle") {
        return;
      }

      const prompt = readAppendMessagePrompt(message);
      if (!prompt) {
        return;
      }

      const formData = new FormData();
      formData.set("intent", "sendMessage");
      formData.set("threadId", activeThreadId ?? "");
      formData.set("executionMode", executionMode);
      formData.set("prompt", prompt);
      void submitFetcher.submit(formData, { method: "post" });
    },
    [activeThreadId, executionMode, submitFetcher]
  );

  const handleAssistantCancel = useCallback(async (): Promise<void> => {
    if (interruptFetcher.state !== "idle") {
      return;
    }

    if (!activeThreadId || !activeTurnId) {
      return;
    }

    const formData = new FormData();
    formData.set("intent", "interruptTurn");
    formData.set("threadId", activeThreadId);
    formData.set("turnId", activeTurnId);
    void interruptFetcher.submit(formData, { method: "post" });
  }, [activeThreadId, activeTurnId, interruptFetcher]);

  const assistantStore = useMemo(
    () => ({
      isRunning: activeTurnId !== null || submitFetcher.state !== "idle",
      messages: assistantMessages,
      convertMessage: convertAssistantStoreMessage,
      onNew: handleAssistantSend,
      onCancel: handleAssistantCancel
    }),
    [
      activeTurnId,
      assistantMessages,
      handleAssistantCancel,
      handleAssistantSend,
      submitFetcher.state
    ]
  );

  const assistantRuntime = useExternalStoreRuntime(assistantStore);

  const handleModeChange = (nextMode: AgentExecutionMode) => {
    setExecutionMode(nextMode);
    if (!activeThreadId) {
      return;
    }

    const formData = new FormData();
    formData.set("intent", "switchMode");
    formData.set("threadId", activeThreadId);
    formData.set("executionMode", nextMode);
    void modeFetcher.submit(formData, { method: "post" });
  };

  const inspectState = useMemo(
    () => parseChatInspectState(new URLSearchParams(location.search)),
    [location.search]
  );

  const updateInspectState = useCallback(
    (nextState: ChatInspectState, options?: { replace?: boolean }) => {
      const nextSearchParams = buildChatInspectSearchParams(
        new URLSearchParams(location.search),
        nextState
      );
      const nextSearch = nextSearchParams.toString();
      void navigate(
        {
          pathname: location.pathname,
          search: nextSearch.length > 0 ? `?${nextSearch}` : "",
          hash: location.hash
        },
        {
          replace: options?.replace ?? false
        }
      );
    },
    [location.hash, location.pathname, location.search, navigate]
  );

  const actionError =
    submitFetcher.data?.error ?? modeFetcher.data?.error ?? interruptFetcher.data?.error ?? null;
  const surfaceState: ChatSurfaceState = {
    transportLifecycle: transportSummary.lifecycle,
    transportLabel: transportSummary.label,
    actionError,
    transportError: transportState.lastError
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-h-0 flex-1">
        <ChatCanvas
          executionMode={executionMode}
          localModeAvailable={localModeAvailable}
          onExecutionModeChange={handleModeChange}
          onInspectEvent={(cursor, tab) => {
            updateInspectState(
              {
                cursor,
                tab
              },
              { replace: false }
            );
          }}
          runtime={assistantRuntime}
          surfaceState={surfaceState}
          switchingMode={modeFetcher.state !== "idle"}
        />
      </div>

      <ChatInspectDrawer
        events={eventState.events}
        inspectState={inspectState}
        onInspectStateChange={updateInspectState}
      />
    </section>
  );
}
