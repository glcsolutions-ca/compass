import { logoutAndRedirect } from "~/lib/auth/auth-session";
import {
  appendAgentEventsBatch,
  createAgentThread,
  getAgentThread,
  startAgentTurn,
  switchAgentThreadMode
} from "~/lib/api/compass-client";
import {
  ChatExecutionModeSchema,
  ChatIntentSchema,
  ChatPromptSchema,
  ChatThreadIdSchema
} from "~/features/chat/chat-schema";

interface DesktopAgentApi {
  isDesktop(): true;
  localAuthStart(input: { mode: "chatgpt" | "apiKey"; apiKey?: string }): Promise<{
    authenticated: boolean;
    authUrl?: string | null;
  }>;
  localAuthStatus(): Promise<{ authenticated: boolean; authUrl?: string | null }>;
  localTurnStart(input: { threadId: string; text: string; turnId?: string }): Promise<{
    turnId: string;
    outputText: string;
  }>;
}

function readDesktopAgentApi(): DesktopAgentApi | null {
  const globalWindow = (globalThis as { window?: { compassDesktop?: unknown } }).window;
  const candidate = globalWindow?.compassDesktop;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const api = candidate as Partial<DesktopAgentApi>;
  if (
    typeof api.isDesktop !== "function" ||
    typeof api.localAuthStatus !== "function" ||
    typeof api.localAuthStart !== "function" ||
    typeof api.localTurnStart !== "function"
  ) {
    return null;
  }

  return api as DesktopAgentApi;
}

function readTenantSlugFromFormData(formData: FormData): string | null {
  const value = formData.get("tenantSlug");
  if (typeof value !== "string") {
    return null;
  }
  const slug = value.trim();
  return slug.length > 0 ? slug : null;
}

export interface ChatActionData {
  error: string | null;
  prompt: string | null;
  answer: string | null;
  threadId: string | null;
  executionMode: "cloud" | "local";
}

export async function submitChatAction({
  request
}: {
  request: Request;
}): Promise<Response | ChatActionData> {
  const formData = await request.formData();
  const intentParse = ChatIntentSchema.safeParse(formData.get("intent"));

  if (!intentParse.success) {
    return {
      error: "Invalid chat action intent.",
      prompt: null,
      answer: null,
      threadId: null,
      executionMode: "cloud"
    } satisfies ChatActionData;
  }

  if (intentParse.data === "logout") {
    return logoutAndRedirect(request);
  }

  const parsedPrompt = ChatPromptSchema.safeParse({
    prompt: formData.get("prompt")
  });

  if (!parsedPrompt.success) {
    return {
      error: parsedPrompt.error.issues[0]?.message ?? "Prompt is required.",
      prompt: null,
      answer: null,
      threadId: null,
      executionMode: "cloud"
    } satisfies ChatActionData;
  }

  const prompt = parsedPrompt.data.prompt;
  const executionMode = ChatExecutionModeSchema.parse(formData.get("executionMode") ?? "cloud");
  const existingThreadId = ChatThreadIdSchema.safeParse(formData.get("threadId")).success
    ? (ChatThreadIdSchema.parse(formData.get("threadId")) ?? null)
    : null;

  const tenantSlug = readTenantSlugFromFormData(formData);
  if (!tenantSlug) {
    return {
      error: "Unable to resolve workspace for this chat action.",
      prompt,
      answer: null,
      threadId: null,
      executionMode
    } satisfies ChatActionData;
  }

  let threadId = existingThreadId;

  if (!threadId) {
    const created = await createAgentThread(request, {
      tenantSlug,
      executionMode
    });

    if (created.status !== 201 || !created.thread) {
      return {
        error: "Unable to create a chat thread.",
        prompt,
        answer: null,
        threadId: null,
        executionMode
      } satisfies ChatActionData;
    }

    threadId = created.thread.threadId;
  } else {
    const current = await getAgentThread(request, threadId);
    if (current.status === 404) {
      const recreated = await createAgentThread(request, {
        tenantSlug,
        executionMode
      });

      if (recreated.status !== 201 || !recreated.thread) {
        return {
          error: "Unable to recover thread state.",
          prompt,
          answer: null,
          threadId: null,
          executionMode
        } satisfies ChatActionData;
      }

      threadId = recreated.thread.threadId;
    } else if (current.status === 200 && current.thread?.executionMode !== executionMode) {
      await switchAgentThreadMode(request, {
        threadId,
        executionMode
      });
    }
  }

  if (executionMode === "local") {
    const desktopApi = readDesktopAgentApi();
    if (!desktopApi) {
      return {
        error: "Local mode is only available in the desktop app.",
        prompt,
        answer: null,
        threadId,
        executionMode
      } satisfies ChatActionData;
    }

    const authStatus = await desktopApi.localAuthStatus();
    if (!authStatus.authenticated) {
      const login = await desktopApi.localAuthStart({ mode: "chatgpt" });
      if (!login.authenticated) {
        return {
          error: login.authUrl
            ? "Complete desktop ChatGPT login in your browser, then send the message again."
            : "Local runtime login is required before sending messages.",
          prompt,
          answer: null,
          threadId,
          executionMode
        } satisfies ChatActionData;
      }
    }

    const localTurn = await desktopApi.localTurnStart({
      threadId,
      text: prompt
    });

    await appendAgentEventsBatch(request, {
      threadId,
      events: [
        {
          turnId: localTurn.turnId,
          method: "turn.started",
          payload: {
            executionMode: "local",
            executionHost: "desktop_local"
          }
        },
        {
          turnId: localTurn.turnId,
          method: "item.delta",
          payload: {
            role: "assistant",
            text: localTurn.outputText
          }
        },
        {
          turnId: localTurn.turnId,
          method: "turn.completed",
          payload: {
            status: "completed"
          }
        }
      ]
    });

    return {
      error: null,
      prompt,
      answer: localTurn.outputText,
      threadId,
      executionMode
    } satisfies ChatActionData;
  }

  const turnResult = await startAgentTurn(request, {
    threadId,
    text: prompt,
    executionMode: "cloud"
  });

  if (turnResult.status !== 200 || !turnResult.turn) {
    return {
      error: "Unable to process your message in cloud mode.",
      prompt,
      answer: null,
      threadId,
      executionMode
    } satisfies ChatActionData;
  }

  return {
    error: null,
    prompt,
    answer: turnResult.turn.outputText ?? "",
    threadId,
    executionMode
  } satisfies ChatActionData;
}
