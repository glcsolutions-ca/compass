import { redirect } from "react-router";
import type { AuthShellLoaderData } from "~/features/auth/types";
import type { ChatContextMode } from "~/features/auth/types";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import { readPersonalContextLabel } from "~/features/chat/chat-context";
import { readDefaultExecutionMode } from "~/features/chat/default-execution-mode";
import { getChatThread, listChatThreadEvents } from "~/features/chat/thread-client";
import type { ChatEvent, ChatExecutionMode, ChatThread } from "~/features/chat/thread-types";
import { buildReturnTo } from "~/lib/auth/auth-session";

export interface ChatLoaderData {
  contextMode: ChatContextMode;
  contextLabel: string;
  workspaceSlug: string;
  threadId: string | null;
  requestedThreadSeed: string | null;
  thread: ChatThread | null;
  initialEvents: ChatEvent[];
  initialCursor: number;
  executionMode: ChatExecutionMode;
}

function resolveWorkspaceSlugOrRedirect(workspaceSlug: string | undefined): string | Response {
  const normalizedWorkspaceSlug = workspaceSlug?.trim() || null;
  return normalizedWorkspaceSlug ? normalizedWorkspaceSlug : redirect("/chat");
}

function resolveWorkspaceAccessRedirect(input: {
  workspaceSlug: string;
  auth: AuthShellLoaderData;
}): Response | null {
  const { workspaceSlug, auth } = input;
  const hasWorkspaceAccess = auth.workspaces.some(
    (workspace) => workspace.status === "active" && workspace.slug === workspaceSlug
  );
  if (hasWorkspaceAccess) {
    return null;
  }

  const fallbackWorkspace =
    auth.personalWorkspaceSlug?.trim() ||
    auth.activeWorkspaceSlug?.trim() ||
    auth.workspaces.find((workspace) => workspace.status === "active")?.slug ||
    null;
  if (!fallbackWorkspace) {
    return redirect("/workspaces");
  }

  return redirect(`/w/${encodeURIComponent(fallbackWorkspace)}/chat`);
}

function parseRequestedThreadSeed(request: Request): string | null {
  const requestedThreadSeedCandidate = new URL(request.url).searchParams.get("thread");
  if (!requestedThreadSeedCandidate) {
    return null;
  }

  return requestedThreadSeedCandidate.trim().length > 0 ? requestedThreadSeedCandidate : null;
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
  workspaceSlug: string;
  threadId: string | null;
}): Promise<ThreadLoadResult | Response> {
  if (!input.threadId) {
    return {
      thread: null,
      initialEvents: [],
      initialCursor: 0,
      executionMode: readDefaultExecutionMode()
    };
  }

  const threadResult = await getChatThread(input.request, input.threadId);
  if (threadResult.status === 401) {
    return buildLoginRedirect(input.request);
  }

  if (threadResult.status === 403 || threadResult.status === 404) {
    return redirect(`/w/${encodeURIComponent(input.workspaceSlug)}/chat`);
  }

  if (!threadResult.data) {
    throw new Error(threadResult.message || "Unable to load chat thread.");
  }

  if (threadResult.data.workspaceSlug && threadResult.data.workspaceSlug !== input.workspaceSlug) {
    return redirect(
      `/w/${encodeURIComponent(threadResult.data.workspaceSlug)}/chat/${encodeURIComponent(input.threadId)}`
    );
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
  workspaceSlug,
  threadId
}: {
  request: Request;
  workspaceSlug: string | undefined;
  threadId: string | undefined;
}): Promise<ChatLoaderData | Response> {
  const auth = await loadAuthShellData({ request });
  if (auth instanceof Response) {
    return auth;
  }

  const resolvedWorkspaceSlug = resolveWorkspaceSlugOrRedirect(workspaceSlug);
  if (resolvedWorkspaceSlug instanceof Response) {
    return resolvedWorkspaceSlug;
  }

  const workspaceAccessRedirect = resolveWorkspaceAccessRedirect({
    workspaceSlug: resolvedWorkspaceSlug,
    auth
  });
  if (workspaceAccessRedirect) {
    return workspaceAccessRedirect;
  }

  const requestedThreadSeed = parseRequestedThreadSeed(request);
  const normalizedThreadId = threadId?.trim() || null;
  const threadContext = await loadThreadContext({
    request,
    workspaceSlug: resolvedWorkspaceSlug,
    threadId: normalizedThreadId
  });
  if (threadContext instanceof Response) {
    return threadContext;
  }

  return {
    contextMode: "personal",
    contextLabel: readPersonalContextLabel({ user: auth.user }),
    workspaceSlug: resolvedWorkspaceSlug,
    threadId: normalizedThreadId,
    requestedThreadSeed,
    thread: threadContext.thread,
    initialEvents: threadContext.initialEvents,
    initialCursor: threadContext.initialCursor,
    executionMode: threadContext.executionMode
  };
}
