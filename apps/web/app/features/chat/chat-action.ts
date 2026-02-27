import type { AgentExecutionMode } from "~/features/chat/agent-types";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import {
  createAgentThread,
  interruptAgentTurn,
  startAgentTurn,
  switchAgentThreadMode
} from "~/features/chat/agent-client";
import { resolveThreadCreateTenantSlug } from "~/features/chat/chat-context";
import {
  ChatExecutionModeSchema,
  ChatIntentSchema,
  ChatPromptSchema,
  ChatThreadIdSchema,
  ChatTurnIdSchema
} from "~/features/chat/chat-schema";
import { logoutAndRedirect } from "~/lib/auth/auth-session";

export interface ChatActionData {
  intent: "sendMessage" | "interruptTurn" | "switchMode" | "logout";
  ok: boolean;
  error: string | null;
  threadId: string | null;
  turnId: string | null;
  executionMode: AgentExecutionMode;
  prompt: string | null;
  answer: string | null;
}

function createErrorAction(input: {
  intent: ChatActionData["intent"];
  error: string;
  executionMode?: AgentExecutionMode;
  threadId?: string | null;
  turnId?: string | null;
  prompt?: string | null;
}): ChatActionData {
  return {
    intent: input.intent,
    ok: false,
    error: input.error,
    threadId: input.threadId ?? null,
    turnId: input.turnId ?? null,
    executionMode: input.executionMode ?? "cloud",
    prompt: input.prompt ?? null,
    answer: null
  };
}

export async function submitChatAction({
  request,
  threadId
}: {
  request: Request;
  threadId: string | undefined;
}): Promise<Response | ChatActionData> {
  const formData = await request.formData();
  const intentResult = ChatIntentSchema.safeParse(formData.get("intent"));
  if (!intentResult.success) {
    return createErrorAction({
      intent: "sendMessage",
      error: "Invalid chat action intent."
    });
  }

  const intent = intentResult.data;
  if (intent === "logout") {
    return logoutAndRedirect(request);
  }

  const requestedExecutionMode = ChatExecutionModeSchema.safeParse(formData.get("executionMode"));
  const executionMode = requestedExecutionMode.success ? requestedExecutionMode.data : "cloud";
  const formThreadId = ChatThreadIdSchema.safeParse(formData.get("threadId"));
  const targetThreadId = formThreadId.success
    ? (formThreadId.data ?? threadId ?? null)
    : (threadId ?? null);

  if (intent === "switchMode") {
    if (!targetThreadId) {
      return createErrorAction({
        intent,
        executionMode,
        error: "Select a thread before switching execution mode."
      });
    }

    const modeSwitchResult = await switchAgentThreadMode(request, {
      threadId: targetThreadId,
      executionMode
    });

    if (!modeSwitchResult.data || modeSwitchResult.status >= 400) {
      return createErrorAction({
        intent,
        executionMode,
        threadId: targetThreadId,
        error: modeSwitchResult.message || "Unable to switch execution mode."
      });
    }

    return {
      intent,
      ok: true,
      error: null,
      threadId: modeSwitchResult.data.threadId,
      turnId: null,
      executionMode: modeSwitchResult.data.executionMode,
      prompt: null,
      answer: null
    };
  }

  if (intent === "interruptTurn") {
    const turnIdResult = ChatTurnIdSchema.safeParse(formData.get("turnId"));
    const targetTurnId = turnIdResult.success ? (turnIdResult.data ?? null) : null;

    if (!targetThreadId || !targetTurnId) {
      return createErrorAction({
        intent,
        executionMode,
        threadId: targetThreadId,
        error: "No active turn to interrupt."
      });
    }

    const interruptResult = await interruptAgentTurn(request, {
      threadId: targetThreadId,
      turnId: targetTurnId
    });

    if (!interruptResult.data || interruptResult.status >= 400) {
      return createErrorAction({
        intent,
        executionMode,
        threadId: targetThreadId,
        turnId: targetTurnId,
        error: interruptResult.message || "Unable to interrupt the running turn."
      });
    }

    return {
      intent,
      ok: true,
      error: null,
      threadId: interruptResult.data.threadId,
      turnId: interruptResult.data.turnId,
      executionMode: interruptResult.data.executionMode,
      prompt: null,
      answer: null
    };
  }

  const parsedPrompt = ChatPromptSchema.safeParse({
    prompt: formData.get("prompt")
  });
  if (!parsedPrompt.success) {
    return createErrorAction({
      intent: "sendMessage",
      executionMode,
      threadId: targetThreadId,
      error: parsedPrompt.error.issues[0]?.message ?? "Prompt is required."
    });
  }

  const prompt = parsedPrompt.data.prompt;
  let resolvedThreadId = targetThreadId;

  if (!resolvedThreadId) {
    const auth = await loadAuthShellData({ request });
    if (auth instanceof Response) {
      return auth;
    }

    let tenantSlug: string;
    try {
      tenantSlug = resolveThreadCreateTenantSlug(auth);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to resolve workspace context.";
      return createErrorAction({
        intent: "sendMessage",
        executionMode,
        prompt,
        error: message
      });
    }

    const createThreadResult = await createAgentThread(request, {
      tenantSlug,
      executionMode,
      title: prompt.slice(0, 80)
    });

    if (!createThreadResult.data || createThreadResult.status >= 400) {
      return createErrorAction({
        intent: "sendMessage",
        executionMode,
        prompt,
        error: createThreadResult.message || "Unable to create a new chat thread."
      });
    }

    resolvedThreadId = createThreadResult.data.threadId;
  }

  const startTurnResult = await startAgentTurn(request, {
    threadId: resolvedThreadId,
    text: prompt,
    executionMode
  });

  if (!startTurnResult.data || startTurnResult.status >= 400) {
    return createErrorAction({
      intent: "sendMessage",
      executionMode,
      threadId: resolvedThreadId,
      prompt,
      error: startTurnResult.message || "Unable to submit this prompt."
    });
  }

  return {
    intent: "sendMessage",
    ok: true,
    error: null,
    threadId: startTurnResult.data.threadId,
    turnId: startTurnResult.data.turnId,
    executionMode: startTurnResult.data.executionMode,
    prompt,
    answer: startTurnResult.data.outputText
  };
}
