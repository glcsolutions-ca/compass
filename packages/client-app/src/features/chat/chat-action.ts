import type { ChatExecutionMode } from "~/features/chat/thread-types";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import {
  createChatThread,
  interruptChatTurn,
  startChatTurn,
  switchChatThreadMode
} from "~/features/chat/thread-client";
import { resolveThreadCreateWorkspaceSlug } from "~/features/chat/chat-context";
import { readDefaultExecutionMode } from "~/features/chat/default-execution-mode";
import {
  CHAT_WORKSPACE_QUERY_PARAM,
  resolveThreadHandle
} from "~/features/chat/new-thread-routing";
import {
  ChatClientRequestIdSchema,
  ChatExecutionModeSchema,
  ChatIntentSchema,
  ChatMessageIdSchema,
  ChatPromptSchema,
  ChatThreadIdSchema,
  ChatTurnIdSchema
} from "~/features/chat/chat-schema";
import { logoutAndRedirect } from "~/lib/auth/auth-session";

export interface ChatActionData {
  intent:
    | "sendMessage"
    | "editMessage"
    | "reloadMessage"
    | "interruptTurn"
    | "switchMode"
    | "logout";
  ok: boolean;
  error: string | null;
  threadId: string | null;
  threadHandle: string | null;
  turnId: string | null;
  executionMode: ChatExecutionMode;
  prompt: string | null;
  answer: string | null;
  clientRequestId?: string | null;
  sourceMessageId?: string | null;
  parentMessageId?: string | null;
}

type PromptIntent = "sendMessage" | "editMessage" | "reloadMessage";

interface PromptActionInput {
  prompt: string;
  sourceMessageId: string | null;
  clientRequestId: string | undefined;
  parentMessageId: string | null;
}

interface ResolvedThreadTarget {
  threadId: string;
  threadHandle: string | null;
}

function parseRequestedWorkspaceSlug(request: Request): string | null {
  const requestedWorkspaceCandidate = new URL(request.url).searchParams.get(
    CHAT_WORKSPACE_QUERY_PARAM
  );
  if (!requestedWorkspaceCandidate) {
    return null;
  }

  const requestedWorkspaceSlug = requestedWorkspaceCandidate.trim();
  return requestedWorkspaceSlug.length > 0 ? requestedWorkspaceSlug : null;
}

function createErrorAction(input: {
  intent: ChatActionData["intent"];
  error: string;
  executionMode?: ChatExecutionMode;
  threadId?: string | null;
  turnId?: string | null;
  prompt?: string | null;
  clientRequestId?: string | null;
  sourceMessageId?: string | null;
  parentMessageId?: string | null;
}): ChatActionData {
  const result: ChatActionData = {
    intent: input.intent,
    ok: false,
    error: input.error,
    threadId: input.threadId ?? null,
    threadHandle: null,
    turnId: input.turnId ?? null,
    executionMode: input.executionMode ?? "cloud",
    prompt: input.prompt ?? null,
    answer: null
  };

  if (input.sourceMessageId !== undefined) {
    result.sourceMessageId = input.sourceMessageId;
  }

  if (input.clientRequestId !== undefined) {
    result.clientRequestId = input.clientRequestId;
  }

  if (input.parentMessageId !== undefined) {
    result.parentMessageId = input.parentMessageId;
  }

  return result;
}

function createSuccessAction(input: {
  intent: ChatActionData["intent"];
  threadId: string;
  threadHandle?: string | null;
  turnId: string | null;
  executionMode: ChatExecutionMode;
  prompt?: string | null;
  answer?: string | null;
  clientRequestId?: string | undefined;
  sourceMessageId?: string | null;
  parentMessageId?: string | null;
}): ChatActionData {
  const result: ChatActionData = {
    intent: input.intent,
    ok: true,
    error: null,
    threadId: input.threadId,
    threadHandle: input.threadHandle ?? null,
    turnId: input.turnId,
    executionMode: input.executionMode,
    prompt: input.prompt ?? null,
    answer: input.answer ?? null
  };

  if (input.clientRequestId !== undefined) {
    result.clientRequestId = input.clientRequestId;
  }

  if (input.sourceMessageId) {
    result.sourceMessageId = input.sourceMessageId;
  }

  if (input.parentMessageId) {
    result.parentMessageId = input.parentMessageId;
  }

  return result;
}

function resolveExecutionMode(formData: FormData): ChatExecutionMode {
  const requestedExecutionMode = ChatExecutionModeSchema.safeParse(formData.get("executionMode"));
  return requestedExecutionMode.success ? requestedExecutionMode.data : readDefaultExecutionMode();
}

function resolveTargetThreadId(formData: FormData): string | null {
  const formThreadId = ChatThreadIdSchema.safeParse(formData.get("threadId"));
  return formThreadId.success ? (formThreadId.data ?? null) : null;
}

function parsePromptActionInput(
  formData: FormData,
  intent: PromptIntent,
  executionMode: ChatExecutionMode,
  targetThreadId: string | null
): PromptActionInput | ChatActionData {
  const sourceMessageIdResult = ChatMessageIdSchema.safeParse(formData.get("sourceMessageId"));
  const sourceMessageId = sourceMessageIdResult.success
    ? (sourceMessageIdResult.data ?? null)
    : null;
  const clientRequestIdResult = ChatClientRequestIdSchema.safeParse(
    formData.get("clientRequestId")
  );
  const clientRequestId = clientRequestIdResult.success ? clientRequestIdResult.data : undefined;
  const parentMessageIdResult = ChatMessageIdSchema.safeParse(formData.get("parentMessageId"));
  const parentMessageId = parentMessageIdResult.success
    ? (parentMessageIdResult.data ?? null)
    : null;
  const parsedPrompt = ChatPromptSchema.safeParse({ prompt: formData.get("prompt") });

  if (!parsedPrompt.success) {
    return createErrorAction({
      intent,
      executionMode,
      threadId: targetThreadId,
      clientRequestId,
      error: parsedPrompt.error.issues[0]?.message ?? "Prompt is required."
    });
  }

  return {
    prompt: parsedPrompt.data.prompt,
    sourceMessageId,
    clientRequestId,
    parentMessageId
  };
}

async function resolveThreadForPromptAction(input: {
  request: Request;
  intent: PromptIntent;
  executionMode: ChatExecutionMode;
  prompt: string;
  clientRequestId: string | undefined;
  targetThreadId: string | null;
}): Promise<ResolvedThreadTarget | Response | ChatActionData> {
  if (input.targetThreadId) {
    return {
      threadId: input.targetThreadId,
      threadHandle: null
    };
  }

  const requiresExistingThread = input.intent === "editMessage" || input.intent === "reloadMessage";
  if (requiresExistingThread) {
    return createErrorAction({
      intent: input.intent,
      executionMode: input.executionMode,
      prompt: input.prompt,
      clientRequestId: input.clientRequestId,
      error: "Select a thread before editing or reloading."
    });
  }

  const auth = await loadAuthShellData({ request: input.request });
  if (auth instanceof Response) {
    return auth;
  }

  let resolvedWorkspaceSlug: string;
  try {
    resolvedWorkspaceSlug =
      parseRequestedWorkspaceSlug(input.request) || resolveThreadCreateWorkspaceSlug(auth);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve workspace context.";
    return createErrorAction({
      intent: input.intent,
      executionMode: input.executionMode,
      prompt: input.prompt,
      clientRequestId: input.clientRequestId,
      error: message
    });
  }

  const createThreadResult = await createChatThread(input.request, {
    workspaceSlug: resolvedWorkspaceSlug,
    executionMode: input.executionMode,
    title: input.prompt.slice(0, 80)
  });

  if (!createThreadResult.data || createThreadResult.status >= 400) {
    return createErrorAction({
      intent: input.intent,
      executionMode: input.executionMode,
      prompt: input.prompt,
      clientRequestId: input.clientRequestId,
      error: createThreadResult.message || "Unable to create a new chat thread."
    });
  }

  return {
    threadId: createThreadResult.data.threadId,
    threadHandle: resolveThreadHandle(createThreadResult.data)
  };
}

async function handleSwitchModeIntent(input: {
  request: Request;
  executionMode: ChatExecutionMode;
  targetThreadId: string | null;
}): Promise<ChatActionData> {
  if (!input.targetThreadId) {
    return createErrorAction({
      intent: "switchMode",
      executionMode: input.executionMode,
      error: "Select a thread before switching execution mode."
    });
  }

  const modeSwitchResult = await switchChatThreadMode(input.request, {
    threadId: input.targetThreadId,
    executionMode: input.executionMode
  });
  if (!modeSwitchResult.data || modeSwitchResult.status >= 400) {
    return createErrorAction({
      intent: "switchMode",
      executionMode: input.executionMode,
      threadId: input.targetThreadId,
      error: modeSwitchResult.message || "Unable to switch execution mode."
    });
  }

  return createSuccessAction({
    intent: "switchMode",
    threadId: modeSwitchResult.data.threadId,
    threadHandle: resolveThreadHandle(modeSwitchResult.data),
    turnId: null,
    executionMode: modeSwitchResult.data.executionMode
  });
}

async function handleInterruptTurnIntent(input: {
  request: Request;
  formData: FormData;
  executionMode: ChatExecutionMode;
  targetThreadId: string | null;
}): Promise<ChatActionData> {
  const turnIdResult = ChatTurnIdSchema.safeParse(input.formData.get("turnId"));
  const targetTurnId = turnIdResult.success ? (turnIdResult.data ?? null) : null;
  if (!input.targetThreadId || !targetTurnId) {
    return createErrorAction({
      intent: "interruptTurn",
      executionMode: input.executionMode,
      threadId: input.targetThreadId,
      error: "No active turn to interrupt."
    });
  }

  const interruptResult = await interruptChatTurn(input.request, {
    threadId: input.targetThreadId,
    turnId: targetTurnId
  });
  if (!interruptResult.data || interruptResult.status >= 400) {
    return createErrorAction({
      intent: "interruptTurn",
      executionMode: input.executionMode,
      threadId: input.targetThreadId,
      turnId: targetTurnId,
      error: interruptResult.message || "Unable to interrupt the running turn."
    });
  }

  return createSuccessAction({
    intent: "interruptTurn",
    threadId: interruptResult.data.threadId,
    turnId: interruptResult.data.turnId,
    executionMode: interruptResult.data.executionMode
  });
}

async function handlePromptIntent(input: {
  request: Request;
  formData: FormData;
  intent: PromptIntent;
  executionMode: ChatExecutionMode;
  targetThreadId: string | null;
}): Promise<Response | ChatActionData> {
  const parsedInput = parsePromptActionInput(
    input.formData,
    input.intent,
    input.executionMode,
    input.targetThreadId
  );
  if ("ok" in parsedInput) {
    return parsedInput;
  }

  const resolvedThreadId = await resolveThreadForPromptAction({
    request: input.request,
    intent: input.intent,
    executionMode: input.executionMode,
    prompt: parsedInput.prompt,
    clientRequestId: parsedInput.clientRequestId,
    targetThreadId: input.targetThreadId
  });
  if (resolvedThreadId instanceof Response) {
    return resolvedThreadId;
  }
  if ("ok" in resolvedThreadId) {
    return resolvedThreadId;
  }

  const startTurnResult = await startChatTurn(input.request, {
    threadId: resolvedThreadId.threadId,
    text: parsedInput.prompt,
    executionMode: input.executionMode,
    clientRequestId: parsedInput.clientRequestId
  });
  if (!startTurnResult.data || startTurnResult.status >= 400) {
    return createErrorAction({
      intent: input.intent,
      executionMode: input.executionMode,
      threadId: resolvedThreadId.threadId,
      prompt: parsedInput.prompt,
      clientRequestId: parsedInput.clientRequestId,
      error: startTurnResult.message || "Unable to submit this prompt."
    });
  }

  return createSuccessAction({
    intent: input.intent,
    threadId: startTurnResult.data.threadId,
    threadHandle: resolvedThreadId.threadHandle,
    turnId: startTurnResult.data.turnId,
    executionMode: startTurnResult.data.executionMode,
    prompt: parsedInput.prompt,
    answer: startTurnResult.data.outputText,
    clientRequestId: parsedInput.clientRequestId,
    sourceMessageId: parsedInput.sourceMessageId,
    parentMessageId: parsedInput.parentMessageId
  });
}

export async function submitChatAction({
  request,
  threadHandle: _threadHandle
}: {
  request: Request;
  threadHandle: string | undefined;
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

  const executionMode = resolveExecutionMode(formData);
  const targetThreadId = resolveTargetThreadId(formData);
  if (intent === "switchMode") {
    return handleSwitchModeIntent({
      request,
      executionMode,
      targetThreadId
    });
  }

  if (intent === "interruptTurn") {
    return handleInterruptTurnIntent({
      request,
      formData,
      executionMode,
      targetThreadId
    });
  }

  return handlePromptIntent({
    request,
    formData,
    intent,
    executionMode,
    targetThreadId
  });
}
