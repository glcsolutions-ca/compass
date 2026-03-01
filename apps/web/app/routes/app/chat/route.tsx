import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
  useExternalStoreRuntime
} from "@assistant-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLoaderData, useLocation, useNavigate } from "react-router";
import type { MetaFunction } from "react-router";
import type { ShellRouteHandle } from "~/features/auth/types";
import { appendAgentThreadEventsBatchClient } from "~/features/chat/agent-client";
import type { AgentExecutionMode, ChatTransportState } from "~/features/chat/agent-types";
import type { ChatActionData } from "~/features/chat/chat-action";
import { submitChatAction } from "~/features/chat/chat-action";
import { resolveReloadPrompt } from "~/features/chat/hooks/chat-compose-utils";
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
  type ChatInspectState
} from "~/features/chat/presentation/chat-runtime-store";
import type { ChatLoaderData } from "~/features/chat/chat-loader";
import { loadChatData } from "~/features/chat/chat-loader";
import { cn } from "~/lib/utils/cn";

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
  const localModeAvailable = false;

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
    if (
      !actionResult ||
      (actionResult.intent !== "sendMessage" &&
        actionResult.intent !== "editMessage" &&
        actionResult.intent !== "reloadMessage") ||
      !actionResult.ok
    ) {
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
  const hasSurfaceError = Boolean(chatActions.actionError || transportState.lastError);
  const surfaceStatusLabel =
    chatActions.actionError || transportState.lastError || transportSummary.label;

  const handleAssistantCancel = useCallback(async (): Promise<void> => {
    chatActions.submitInterruptTurn(activeTurnId);
  }, [activeTurnId, chatActions]);

  const handleAssistantReload = useCallback(
    async (parentId: string | null): Promise<void> => {
      const prompt = resolveReloadPrompt(assistantMessages, parentId);
      if (!prompt) {
        return;
      }

      await chatActions.handleAssistantReload({
        parentId,
        prompt
      });
    },
    [assistantMessages, chatActions]
  );

  const attachmentsAdapter = useMemo(
    () =>
      new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter()
      ]),
    []
  );
  const speechAdapter = useMemo(() => new WebSpeechSynthesisAdapter(), []);
  const dictationAdapter = useMemo(
    () =>
      WebSpeechDictationAdapter.isSupported()
        ? new WebSpeechDictationAdapter({
            interimResults: true
          })
        : undefined,
    []
  );

  const feedbackAdapter = useMemo(
    () => ({
      submit: (feedback: {
        message: { id: string; metadata?: { custom?: { turnId?: unknown } } };
        type: "positive" | "negative";
      }) => {
        if (!chatActions.activeThreadId) {
          return;
        }

        const turnId = feedback.message.metadata?.custom?.turnId;
        void appendAgentThreadEventsBatchClient({
          threadId: chatActions.activeThreadId,
          events: [
            {
              turnId: typeof turnId === "string" ? turnId : undefined,
              method: "message.feedback.submitted",
              payload: {
                messageId: feedback.message.id,
                type: feedback.type
              }
            }
          ]
        });
      }
    }),
    [chatActions.activeThreadId]
  );

  const assistantStore = useMemo(
    () => ({
      isRunning: activeTurnId !== null,
      messages: assistantMessages,
      convertMessage: convertAssistantStoreMessage,
      onNew: chatActions.handleAssistantSend,
      onEdit: chatActions.handleAssistantEdit,
      onReload: handleAssistantReload,
      onCancel: handleAssistantCancel,
      adapters: {
        attachments: attachmentsAdapter,
        speech: speechAdapter,
        dictation: dictationAdapter,
        feedback: feedbackAdapter
      },
      unstable_capabilities: {
        copy: true
      }
    }),
    [
      activeTurnId,
      assistantMessages,
      attachmentsAdapter,
      chatActions.handleAssistantEdit,
      chatActions.handleAssistantSend,
      dictationAdapter,
      feedbackAdapter,
      handleAssistantCancel,
      handleAssistantReload,
      speechAdapter
    ]
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

  return (
    <section className="flex h-full min-h-0 w-full flex-col">
      <div className="mx-auto flex w-full max-w-[var(--aui-thread-max-width)] flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-2 text-xs md:flex-nowrap md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            htmlFor="chat-route-mode"
          >
            Mode
          </label>
          <select
            className="h-7 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground"
            disabled={chatActions.modeFetcher.state !== "idle"}
            id="chat-route-mode"
            onChange={(event) =>
              chatActions.handleModeChange(event.target.value === "local" ? "local" : "cloud")
            }
            value={executionMode}
          >
            <option value="cloud">Cloud</option>
            <option disabled={!localModeAvailable} value="local">
              Local{localModeAvailable ? "" : " (desktop only)"}
            </option>
          </select>
        </div>

        <span
          className={cn(
            "w-full truncate text-[11px] text-muted-foreground md:w-auto",
            hasSurfaceError && "text-destructive"
          )}
          role={hasSurfaceError ? "alert" : "status"}
        >
          {surfaceStatusLabel}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <ChatCanvas runtime={assistantRuntime} />
      </div>

      <ChatInspectDrawer
        events={eventState.events}
        inspectState={inspectState}
        onInspectStateChange={updateInspectState}
      />
    </section>
  );
}
