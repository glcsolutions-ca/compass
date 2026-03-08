export const NEW_THREAD_QUERY_PARAM = "thread";

function normalizeSegment(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function createThreadToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveNewThreadTarget(workspaceSlug: string): string {
  const normalizedWorkspace = normalizeSegment(workspaceSlug);
  if (!normalizedWorkspace) {
    return "/chat";
  }

  const encodedWorkspace = encodeURIComponent(normalizedWorkspace);
  return `/w/${encodedWorkspace}/chat`;
}

export function buildNewThreadHref(options: {
  workspaceSlug: string;
  threadToken?: string;
}): string {
  const url = new URL(resolveNewThreadTarget(options.workspaceSlug), "http://compass.local");
  url.search = "";
  url.searchParams.set(NEW_THREAD_QUERY_PARAM, options.threadToken ?? createThreadToken());
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function buildThreadHref(workspaceSlug: string, threadId: string): string {
  const normalizedWorkspace = normalizeSegment(workspaceSlug);
  const normalizedThreadId = normalizeSegment(threadId);
  if (!normalizedWorkspace) {
    if (!normalizedThreadId) {
      return "/chat";
    }

    return `/chat/${encodeURIComponent(normalizedThreadId)}`;
  }

  if (!normalizedThreadId) {
    return `/w/${encodeURIComponent(normalizedWorkspace)}/chat`;
  }

  const encodedWorkspace = encodeURIComponent(normalizedWorkspace);
  const encoded = encodeURIComponent(normalizedThreadId);
  return `/w/${encodedWorkspace}/chat/${encoded}`;
}
