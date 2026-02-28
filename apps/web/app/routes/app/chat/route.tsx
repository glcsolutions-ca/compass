import { useExternalStoreRuntime } from "@assistant-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import type { MetaFunction } from "react-router";
import type { ShellRouteHandle } from "~/features/auth/types";
import type { AgentExecutionMode, ChatTransportState } from "~/features/chat/agent-types";
import type { ChatActionData } from "~/features/chat/chat-action";
import { submitChatAction } from "~/features/chat/chat-action";
import { useChatActions } from "~/features/chat/hooks/use-chat-actions";
import { useChatTimeline } from "~/features/chat/hooks/use-chat-timeline";
import { useChatTransport } from "~/features/chat/hooks/use-chat-transport";
import { ChatCanvas } from "~/features/chat/presentation/chat-canvas";
import {
  buildChatInspectSearchParams,
  ChatInspectDrawer,
  parseChatInspectState
} from "~/features/chat/presentation/chat-inspect-drawer";
import {
  convertAssistantStoreMessage,
  type ChatInspectState,
  type ChatSurfaceState
} from "~/features/chat/presentation/chat-runtime-store";
import type { ChatLoaderData } from "~/features/chat/chat-loader";
import { loadChatData } from "~/features/chat/chat-loader";

interface TransportSummary {
  lifecycle: ChatTransportState["lifecycle"];
  label: string;
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
  params: { workspaceSlug?: string; threadId?: string };
}): Promise<ChatLoaderData | Response> {
  return loadChatData({
    request,
    workspaceSlug: params.workspaceSlug,
    threadId: params.threadId
  });
}

export async function clientAction({
  request,
  params
}: {
  request: Request;
  params: { workspaceSlug?: string; threadId?: string };
}): Promise<Response | ChatActionData> {
  return submitChatAction({
    request,
    workspaceSlug: params.workspaceSlug,
    threadId: params.threadId
  });
}

export default function ChatRoute() {
  const loaderData = useLoaderData<ChatLoaderData>();
  const location = useLocation();
  const navigate = useNavigate();
  const [executionMode, setExecutionMode] = useState<AgentExecutionMode>(loaderData.executionMode);
  const [localModeAvailable] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return isDesktopLocalModeAvailable();
  });

  useEffect(() => {
    setExecutionMode(loaderData.executionMode);
  }, [loaderData.executionMode, loaderData.threadId]);

  const chatActions = useChatActions({
    workspaceSlug: loaderData.workspaceSlug,
    loaderThreadId: loaderData.threadId,
    executionMode,
    onExecutionModeChange: setExecutionMode
  });

  const { eventState, transportState } = useChatTransport({
    activeThreadId: chatActions.activeThreadId,
    initialCursor: loaderData.initialCursor,
    initialEvents: loaderData.initialEvents
  });

  const { activeTurnId, assistantMessages, registerSubmittedPrompt } = useChatTimeline({
    resetKey: `${loaderData.workspaceSlug}:${loaderData.threadId ?? "new"}`,
    events: eventState.events,
    submitState: chatActions.submitFetcher.state,
    submitFormData: chatActions.submitFetcher.formData
  });

  useEffect(() => {
    const actionResult = chatActions.submitFetcher.data;
    if (!actionResult || actionResult.intent !== "sendMessage" || !actionResult.ok) {
      return;
    }

    if (actionResult.prompt) {
      registerSubmittedPrompt({
        turnId: actionResult.turnId,
        prompt: actionResult.prompt
      });
    }
  }, [chatActions.submitFetcher.data, registerSubmittedPrompt]);

  const transportSummary = readTransportSummary(transportState);

  const handleAssistantCancel = useCallback(async (): Promise<void> => {
    chatActions.submitInterruptTurn(activeTurnId);
  }, [activeTurnId, chatActions]);

  const assistantStore = useMemo(
    () => ({
      isRunning: activeTurnId !== null,
      messages: assistantMessages,
      convertMessage: convertAssistantStoreMessage,
      onNew: chatActions.handleAssistantSend,
      onCancel: handleAssistantCancel
    }),
    [activeTurnId, assistantMessages, chatActions.handleAssistantSend, handleAssistantCancel]
  );

  const assistantRuntime = useExternalStoreRuntime(assistantStore);

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

  const surfaceState: ChatSurfaceState = {
    transportLifecycle: transportSummary.lifecycle,
    transportLabel: transportSummary.label,
    actionError: chatActions.actionError,
    transportError: transportState.lastError
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col">
      <div className="flex min-h-0 flex-1">
        <ChatCanvas
          executionMode={executionMode}
          localModeAvailable={localModeAvailable}
          onExecutionModeChange={chatActions.handleModeChange}
          runtime={assistantRuntime}
          surfaceState={surfaceState}
          switchingMode={chatActions.modeFetcher.state !== "idle"}
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
