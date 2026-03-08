export const NEW_THREAD_QUERY_PARAM = "thread";
export const CHAT_WORKSPACE_QUERY_PARAM = "workspace";

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

  const url = new URL("/chat", "http://compass.local");
  url.searchParams.set(CHAT_WORKSPACE_QUERY_PARAM, normalizedWorkspace);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function buildNewThreadHref(options: {
  workspaceSlug: string;
  threadToken?: string;
}): string {
  const url = new URL(resolveNewThreadTarget(options.workspaceSlug), "http://compass.local");
  url.search = "";
  const normalizedWorkspace = normalizeSegment(options.workspaceSlug);
  if (normalizedWorkspace) {
    url.searchParams.set(CHAT_WORKSPACE_QUERY_PARAM, normalizedWorkspace);
  }
  url.searchParams.set(NEW_THREAD_QUERY_PARAM, options.threadToken ?? createThreadToken());
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function buildThreadHref(threadHandle: string): string {
  const normalizedThreadHandle = normalizeSegment(threadHandle);
  if (!normalizedThreadHandle) {
    return "/chat";
  }

  return `/c/${encodeURIComponent(normalizedThreadHandle)}`;
}

export function resolveThreadHandle(input: {
  sessionIdentifier?: string | null;
  threadId: string;
}): string {
  const sessionIdentifier = normalizeSegment(input.sessionIdentifier);
  if (sessionIdentifier) {
    return sessionIdentifier;
  }

  return normalizeSegment(input.threadId);
}
