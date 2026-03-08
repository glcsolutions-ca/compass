import { redirect } from "react-router";
import type { AuthShellLoaderData, ChatContextMode } from "~/features/auth/types";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import {
  readPersonalContextLabel,
  resolveThreadCreateWorkspaceSlug
} from "~/features/chat/chat-context";
import { readDefaultExecutionMode } from "~/features/chat/default-execution-mode";
import {
  buildNewThreadHref,
  CHAT_WORKSPACE_QUERY_PARAM,
  resolveThreadHandle
} from "~/features/chat/new-thread-routing";
import { getChatThread, listChatThreadEvents } from "~/features/chat/thread-client";
import type { ChatEvent, ChatExecutionMode, ChatThread } from "~/features/chat/thread-types";
import { buildReturnTo } from "~/lib/auth/auth-session";

export interface ChatLoaderData {
  contextMode: ChatContextMode;
  contextLabel: string;
  workspaceSlug: string;
  threadId: string | null;
  threadHandle: string | null;
  requestedThreadSeed: string | null;
  thread: ChatThread | null;
  initialEvents: ChatEvent[];
  initialCursor: number;
  executionMode: ChatExecutionMode;
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

function hasWorkspaceAccess(input: { auth: AuthShellLoaderData; workspaceSlug: string }): boolean {
  return input.auth.workspaces.some(
    (workspace) => workspace.status === "active" && workspace.slug === input.workspaceSlug
  );
}

function resolveNewChatWorkspace(input: {
  auth: AuthShellLoaderData;
  request: Request;
  requestedThreadSeed: string | null;
}): string | Response {
  const requestedWorkspaceSlug = parseRequestedWorkspaceSlug(input.request);
  if (
    requestedWorkspaceSlug &&
    hasWorkspaceAccess({ auth: input.auth, workspaceSlug: requestedWorkspaceSlug })
  ) {
    return requestedWorkspaceSlug;
  }

  let fallbackWorkspaceSlug: string;
  try {
    fallbackWorkspaceSlug = resolveThreadCreateWorkspaceSlug(input.auth);
  } catch {
    return redirect("/workspaces");
  }

  if (requestedWorkspaceSlug && requestedWorkspaceSlug !== fallbackWorkspaceSlug) {
    return redirect(
      input.requestedThreadSeed
        ? buildNewThreadHref({
            workspaceSlug: fallbackWorkspaceSlug,
            threadToken: input.requestedThreadSeed
          })
        : `/chat?${CHAT_WORKSPACE_QUERY_PARAM}=${encodeURIComponent(fallbackWorkspaceSlug)}`
    );
  }

  return fallbackWorkspaceSlug;
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
  threadHandle: string | null;
  auth: AuthShellLoaderData;
  requestedThreadSeed: string | null;
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
      auth: input.auth,
      request: input.request,
      requestedThreadSeed: input.requestedThreadSeed
    });
    if (workspaceSlug instanceof Response) {
      return workspaceSlug;
    }

    return redirect(
      input.requestedThreadSeed
        ? buildNewThreadHref({
            workspaceSlug,
            threadToken: input.requestedThreadSeed
          })
        : `/chat?${CHAT_WORKSPACE_QUERY_PARAM}=${encodeURIComponent(workspaceSlug)}`
    );
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

  const requestedThreadSeed = parseRequestedThreadSeed(request);
  const normalizedThreadHandle = threadHandle?.trim() || null;
  const threadContext = await loadThreadContext({
    request,
    threadHandle: normalizedThreadHandle,
    auth,
    requestedThreadSeed
  });
  if (threadContext instanceof Response) {
    return threadContext;
  }

  const workspaceSlug =
    threadContext.thread?.workspaceSlug ||
    resolveNewChatWorkspace({
      auth,
      request,
      requestedThreadSeed
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
    requestedThreadSeed,
    thread: threadContext.thread,
    initialEvents: threadContext.initialEvents,
    initialCursor: threadContext.initialCursor,
    executionMode: threadContext.executionMode
  };
}
