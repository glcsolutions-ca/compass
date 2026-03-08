import { redirect } from "react-router";
import {
  buildNewThreadHref,
  buildThreadHref,
  resolveThreadHandle
} from "~/features/chat/new-thread-routing";
import { getChatThread } from "~/features/chat/thread-client";

function parseRequestedThreadSeed(request: Request): string | null {
  const requestedThreadSeedCandidate = new URL(request.url).searchParams.get("thread");
  if (!requestedThreadSeedCandidate) {
    return null;
  }

  const requestedThreadSeed = requestedThreadSeedCandidate.trim();
  return requestedThreadSeed.length > 0 ? requestedThreadSeed : null;
}

export async function clientLoader({
  request,
  params
}: {
  request: Request;
  params: { workspaceSlug?: string; threadId?: string };
}): Promise<Response> {
  const workspaceSlug = params.workspaceSlug?.trim();
  const requestedThreadSeed = parseRequestedThreadSeed(request);

  if (!params.threadId) {
    if (!workspaceSlug) {
      return redirect("/chat");
    }

    return redirect(
      requestedThreadSeed
        ? buildNewThreadHref({ workspaceSlug, threadToken: requestedThreadSeed })
        : `/chat?workspace=${encodeURIComponent(workspaceSlug)}`
    );
  }

  const threadResult = await getChatThread(request, params.threadId);
  if (threadResult.data) {
    return redirect(buildThreadHref(resolveThreadHandle(threadResult.data)));
  }

  if (!workspaceSlug) {
    return redirect("/chat");
  }

  return redirect(
    requestedThreadSeed
      ? buildNewThreadHref({ workspaceSlug, threadToken: requestedThreadSeed })
      : `/chat?workspace=${encodeURIComponent(workspaceSlug)}`
  );
}

export default function LegacyChatRoute() {
  return null;
}
