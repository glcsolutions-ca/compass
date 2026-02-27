import type { AuthShellLoaderData, ChatContextMode } from "~/features/auth/types";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import { getAgentThread } from "~/lib/api/compass-client";

export interface ChatLoaderData {
  contextMode: ChatContextMode;
  contextLabel: string;
  tenantSlug: string | null;
  threadId: string | null;
  executionMode: "cloud" | "local";
}

function readPersonalContextLabel(input: {
  user: {
    displayName: string | null;
    primaryEmail: string | null;
  } | null;
}): string {
  const displayName = input.user?.displayName?.trim();
  if (displayName) {
    return `${displayName} (Personal)`;
  }

  const email = input.user?.primaryEmail?.trim();
  if (email) {
    return `${email} (Personal)`;
  }

  return "Personal";
}

function readDefaultTenantSlug(auth: AuthShellLoaderData): string | null {
  const lastActive = auth.lastActiveTenantSlug?.trim();
  if (lastActive) {
    return lastActive;
  }

  const activeMembership = auth.memberships.find((membership) => membership.status === "active");
  return activeMembership?.tenantSlug ?? null;
}

export async function loadChatData({
  request
}: {
  request: Request;
}): Promise<ChatLoaderData | Response> {
  const auth = await loadAuthShellData({ request });
  if (auth instanceof Response) {
    return auth;
  }

  const url = new URL(request.url);
  const threadCandidate = url.searchParams.get("thread");
  const threadId = threadCandidate && threadCandidate.trim().length > 0 ? threadCandidate : null;
  let executionMode: "cloud" | "local" = "cloud";

  if (threadId) {
    const threadResult = await getAgentThread(request, threadId);
    if (threadResult.status === 200 && threadResult.thread) {
      executionMode = threadResult.thread.executionMode;
    }
  }

  return {
    contextMode: "personal",
    contextLabel: readPersonalContextLabel({ user: auth.user }),
    tenantSlug: readDefaultTenantSlug(auth),
    threadId,
    executionMode
  };
}
