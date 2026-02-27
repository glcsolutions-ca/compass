import { redirect } from "react-router";
import type { ChatContextMode } from "~/features/auth/types";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import {
  resolveThreadCreateTenantSlug,
  readPersonalContextLabel
} from "~/features/chat/chat-context";
import { getAgentThread, listAgentThreadEvents } from "~/features/chat/agent-client";
import type { AgentEvent, AgentExecutionMode, AgentThread } from "~/features/chat/agent-types";
import { buildReturnTo } from "~/lib/auth/auth-session";

export interface ChatLoaderData {
  contextMode: ChatContextMode;
  contextLabel: string;
  threadId: string | null;
  requestedThreadSeed: string | null;
  thread: AgentThread | null;
  initialEvents: AgentEvent[];
  initialCursor: number;
  executionMode: AgentExecutionMode;
  createThreadTenantSlug: string;
}

export async function loadChatData({
  request,
  threadId
}: {
  request: Request;
  threadId: string | undefined;
}): Promise<ChatLoaderData | Response> {
  const auth = await loadAuthShellData({ request });
  if (auth instanceof Response) {
    return auth;
  }

  const url = new URL(request.url);
  const requestedThreadSeedCandidate = url.searchParams.get("thread");
  const requestedThreadSeed =
    requestedThreadSeedCandidate && requestedThreadSeedCandidate.trim().length > 0
      ? requestedThreadSeedCandidate
      : null;

  const normalizedThreadId = threadId?.trim() || null;
  let resolvedThread: AgentThread | null = null;
  let initialEvents: AgentEvent[] = [];
  let initialCursor = 0;
  let executionMode: AgentExecutionMode = "cloud";

  if (normalizedThreadId) {
    const threadResult = await getAgentThread(request, normalizedThreadId);
    if (threadResult.status === 401) {
      return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
    }

    if (threadResult.status === 403 || threadResult.status === 404) {
      return redirect("/chat");
    }

    if (!threadResult.data) {
      throw new Error(threadResult.message || "Unable to load chat thread.");
    }

    resolvedThread = threadResult.data;
    executionMode = resolvedThread.executionMode;

    const eventsResult = await listAgentThreadEvents(request, {
      threadId: resolvedThread.threadId,
      cursor: 0,
      limit: 300
    });

    if (eventsResult.status === 401) {
      return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
    }

    if (eventsResult.data) {
      initialEvents = eventsResult.data.events;
      initialCursor = eventsResult.data.nextCursor;
    }
  }

  return {
    contextMode: "personal",
    contextLabel: readPersonalContextLabel({ user: auth.user }),
    threadId: normalizedThreadId,
    requestedThreadSeed,
    thread: resolvedThread,
    initialEvents,
    initialCursor,
    executionMode,
    createThreadTenantSlug: resolveThreadCreateTenantSlug(auth)
  };
}
