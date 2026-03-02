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
import type { AgentExecutionMode } from "~/features/chat/agent-types";
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

  useEffect(() => {
    setExecutionMode(loaderData.executionMode);
  }, [loaderData.executionMode, loaderData.threadId]);

  const chatActions = useChatActions({
    workspaceSlug: loaderData.workspaceSlug,
    loaderThreadId: loaderData.threadId,
    executionMode,
    onExecutionModeChange: setExecutionMode
  });

  const { eventState } = useChatTransport({
    activeThreadId: chatActions.activeThreadId,
    initialCursor: loaderData.initialCursor,
    initialEvents: loaderData.initialEvents
  });

  const { activeTurnId, assistantMessages } = useChatTimeline({
    resetKey: `${loaderData.workspaceSlug}:${loaderData.threadId ?? "new"}`,
    events: eventState.events,
    submitState: chatActions.submitFetcher.state,
    submitFormData: chatActions.submitFetcher.formData,
    submitResult: chatActions.submitFetcher.data
  });

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
