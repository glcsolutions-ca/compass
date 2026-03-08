import { redirect } from "react-router";
import type { AuthShellLoaderData, ChatContextMode } from "~/features/auth/types";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import {
  readPersonalContextLabel,
  resolveThreadCreateWorkspaceSlug
} from "~/features/chat/chat-context";
import { readDefaultExecutionMode } from "~/features/chat/default-execution-mode";
import { resolveThreadHandle } from "~/features/chat/new-thread-routing";
import { getChatThread, listChatThreadEvents } from "~/features/chat/thread-client";
import type { ChatEvent, ChatExecutionMode, ChatThread } from "~/features/chat/thread-types";
import { buildReturnTo } from "~/lib/auth/auth-session";
import { resolvePreferredWorkspaceSlug } from "~/lib/workspaces/workspace-preference";

export interface ChatLoaderData {
  contextMode: ChatContextMode;
  contextLabel: string;
  workspaceSlug: string;
  threadId: string | null;
  threadHandle: string | null;
  thread: ChatThread | null;
  initialEvents: ChatEvent[];
  initialCursor: number;
  executionMode: ChatExecutionMode;
}

function resolveNewChatWorkspace(input: { auth: AuthShellLoaderData }): string | Response {
  const preferredWorkspaceSlug = resolvePreferredWorkspaceSlug(input.auth);
  if (preferredWorkspaceSlug) {
    return preferredWorkspaceSlug;
  }

  let fallbackWorkspaceSlug: string;
  try {
    fallbackWorkspaceSlug = resolveThreadCreateWorkspaceSlug(input.auth);
  } catch {
    return redirect("/workspaces");
  }

  return fallbackWorkspaceSlug;
}

function buildLoginRedirect(request: Request): Response {
  return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
}

interface ThreadLoadResult {
  thread: ChatThread | null;
  initialEvents: ChatEvent[];
  initialCursor: number;
  executionMode: ChatExecutionMode;
}

async function loadThreadContext(input: {
  request: Request;
  threadHandle: string | null;
  auth: AuthShellLoaderData;
}): Promise<ThreadLoadResult | Response> {
  if (!input.threadHandle) {
    return {
      thread: null,
      initialEvents: [],
      initialCursor: 0,
      executionMode: readDefaultExecutionMode()
    };
  }

  const threadResult = await getChatThread(input.request, input.threadHandle);
  if (threadResult.status === 401) {
    return buildLoginRedirect(input.request);
  }

  if (threadResult.status === 403 || threadResult.status === 404) {
    const workspaceSlug = resolveNewChatWorkspace({
      auth: input.auth
    });
    if (workspaceSlug instanceof Response) {
      return workspaceSlug;
    }

    return redirect("/chat");
  }

  if (!threadResult.data) {
    throw new Error(threadResult.message || "Unable to load chat thread.");
  }

  const resolvedThread = threadResult.data;
  const eventsResult = await listChatThreadEvents(input.request, {
    threadId: resolvedThread.threadId,
    cursor: 0,
    limit: 300
  });

  if (eventsResult.status === 401) {
    return buildLoginRedirect(input.request);
  }

  return {
    thread: resolvedThread,
    initialEvents: eventsResult.data?.events ?? [],
    initialCursor: eventsResult.data?.nextCursor ?? 0,
    executionMode: resolvedThread.executionMode
  };
}

export async function loadChatData({
  request,
  threadHandle
}: {
  request: Request;
  threadHandle: string | undefined;
}): Promise<ChatLoaderData | Response> {
  const auth = await loadAuthShellData({ request });
  if (auth instanceof Response) {
    return auth;
  }

  const normalizedThreadHandle = threadHandle?.trim() || null;
  const threadContext = await loadThreadContext({
    request,
    threadHandle: normalizedThreadHandle,
    auth
  });
  if (threadContext instanceof Response) {
    return threadContext;
  }

  const workspaceSlug =
    threadContext.thread?.workspaceSlug ||
    resolveNewChatWorkspace({
      auth
    });
  if (workspaceSlug instanceof Response) {
    return workspaceSlug;
  }

  return {
    contextMode: "personal",
    contextLabel: readPersonalContextLabel({ user: auth.user }),
    workspaceSlug,
    threadId: threadContext.thread?.threadId ?? null,
    threadHandle: threadContext.thread ? resolveThreadHandle(threadContext.thread) : null,
    thread: threadContext.thread,
    initialEvents: threadContext.initialEvents,
    initialCursor: threadContext.initialCursor,
    executionMode: threadContext.executionMode
  };
}
