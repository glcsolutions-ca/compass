import type { AppendMessage } from "@assistant-ui/react";
import { useCallback, useEffect, useMemo } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { AgentExecutionMode } from "~/features/chat/agent-types";
import type { ChatActionData } from "~/features/chat/chat-action";
import { upsertChatThreadHistoryItem } from "~/features/chat/chat-thread-history";
import { readAppendMessagePrompt } from "~/features/chat/hooks/chat-compose-utils";
import { buildThreadHref } from "~/features/chat/new-thread-routing";

interface UseChatActionsInput {
  workspaceSlug: string;
  loaderThreadId: string | null;
  executionMode: AgentExecutionMode;
  onExecutionModeChange: (mode: AgentExecutionMode) => void;
}

function resolveActiveThreadId(input: {
  loaderThreadId: string | null;
  submitResultThreadId: string | null | undefined;
}): string | null {
  return input.loaderThreadId ?? input.submitResultThreadId ?? null;
}

export interface ChatActionsController {
  submitFetcher: ReturnType<typeof useFetcher<ChatActionData>>;
  modeFetcher: ReturnType<typeof useFetcher<ChatActionData>>;
  interruptFetcher: ReturnType<typeof useFetcher<ChatActionData>>;
  activeThreadId: string | null;
  actionError: string | null;
  handleAssistantSend: (message: AppendMessage) => Promise<void>;
  handleAssistantEdit: (message: AppendMessage) => Promise<void>;
  handleAssistantReload: (input: { parentId: string | null; prompt: string }) => Promise<void>;
  submitAssistantFeedback: (input: {
    messageId: string;
    turnId: string | null;
    type: "positive" | "negative";
  }) => Promise<void>;
  submitInterruptTurn: (activeTurnId: string | null) => void;
  handleModeChange: (mode: AgentExecutionMode) => void;
}

export function useChatActions({
  workspaceSlug,
  loaderThreadId,
  executionMode,
  onExecutionModeChange
}: UseChatActionsInput): ChatActionsController {
  const navigate = useNavigate();
  const submitFetcher = useFetcher<ChatActionData>();
  const modeFetcher = useFetcher<ChatActionData>();
  const interruptFetcher = useFetcher<ChatActionData>();

  const activeThreadId = resolveActiveThreadId({
    loaderThreadId,
    submitResultThreadId: submitFetcher.data?.threadId
  });

  useEffect(() => {
    const actionResult = submitFetcher.data;
    if (
      !actionResult ||
      (actionResult.intent !== "sendMessage" &&
        actionResult.intent !== "editMessage" &&
        actionResult.intent !== "reloadMessage") ||
      !actionResult.ok
    ) {
      return;
    }

    if (actionResult.threadId && actionResult.threadId !== loaderThreadId) {
      void navigate(buildThreadHref(workspaceSlug, actionResult.threadId), {
        replace: true
      });
    }

    if (actionResult.threadId) {
      const title =
        actionResult.prompt?.slice(0, 80) || `Thread ${actionResult.threadId.slice(0, 8)}`;
      upsertChatThreadHistoryItem({
        threadId: actionResult.threadId,
        workspaceSlug,
        title,
        executionMode: actionResult.executionMode,
        status: "inProgress"
      });
    }
  }, [loaderThreadId, navigate, submitFetcher.data, workspaceSlug]);

  const submitPromptIntent = useCallback(
    (input: {
      intent: "sendMessage" | "editMessage" | "reloadMessage";
      prompt: string;
      sourceMessageId?: string | null;
      parentMessageId?: string | null;
    }) => {
      if (submitFetcher.state !== "idle") {
        return;
      }

      const prompt = input.prompt.trim();
      if (!prompt) {
        return;
      }

      const formData = new FormData();
      formData.set("intent", input.intent);
      formData.set("threadId", activeThreadId ?? "");
      formData.set("executionMode", executionMode);
      formData.set("prompt", prompt);

      if (input.sourceMessageId) {
        formData.set("sourceMessageId", input.sourceMessageId);
      }

      if (input.parentMessageId) {
        formData.set("parentMessageId", input.parentMessageId);
      }

      void submitFetcher.submit(formData, { method: "post" });
    },
    [activeThreadId, executionMode, submitFetcher]
  );

  const handleAssistantSend = useCallback(
    async (message: AppendMessage): Promise<void> => {
      const prompt = readAppendMessagePrompt(message);
      if (!prompt) {
        return;
      }

      submitPromptIntent({
        intent: "sendMessage",
        prompt
      });
    },
    [submitPromptIntent]
  );

  const handleAssistantEdit = useCallback(
    async (message: AppendMessage): Promise<void> => {
      const prompt = readAppendMessagePrompt(message);
      if (!prompt) {
        return;
      }

      submitPromptIntent({
        intent: "editMessage",
        prompt,
        sourceMessageId: message.sourceId,
        parentMessageId: message.parentId
      });
    },
    [submitPromptIntent]
  );

  const handleAssistantReload = useCallback(
    async (input: { parentId: string | null; prompt: string }): Promise<void> => {
      submitPromptIntent({
        intent: "reloadMessage",
        prompt: input.prompt,
        parentMessageId: input.parentId
      });
    },
    [submitPromptIntent]
  );

  const submitAssistantFeedback = useCallback(
    async (_input: {
      messageId: string;
      turnId: string | null;
      type: "positive" | "negative";
    }): Promise<void> => {
      // Runtime feedback persistence is handled by route-level adapter composition.
    },
    []
  );

  const submitInterruptTurn = useCallback(
    (activeTurnId: string | null): void => {
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
    },
    [activeThreadId, interruptFetcher]
  );

  const handleModeChange = useCallback(
    (nextMode: AgentExecutionMode) => {
      onExecutionModeChange(nextMode);
      if (!activeThreadId) {
        return;
      }

      const formData = new FormData();
      formData.set("intent", "switchMode");
      formData.set("threadId", activeThreadId);
      formData.set("executionMode", nextMode);
      void modeFetcher.submit(formData, { method: "post" });
    },
    [activeThreadId, modeFetcher, onExecutionModeChange]
  );

  const actionError = useMemo(
    () =>
      submitFetcher.data?.error ?? modeFetcher.data?.error ?? interruptFetcher.data?.error ?? null,
    [interruptFetcher.data?.error, modeFetcher.data?.error, submitFetcher.data?.error]
  );

  return {
    submitFetcher,
    modeFetcher,
    interruptFetcher,
    activeThreadId,
    actionError,
    handleAssistantSend,
    handleAssistantEdit,
    handleAssistantReload,
    submitAssistantFeedback,
    submitInterruptTurn,
    handleModeChange
  };
}

export const __private__ = {
  resolveActiveThreadId
};
