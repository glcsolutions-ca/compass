import type { ChatContextMode } from "~/features/auth/types";
import { loadAuthShellData } from "~/features/auth/shell-loader";

export interface ChatLoaderData {
  contextMode: ChatContextMode;
  contextLabel: string;
  threadId: string | null;
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

  return {
    contextMode: "personal",
    contextLabel: readPersonalContextLabel({ user: auth.user }),
    threadId
  };
}
