export const NEW_THREAD_QUERY_PARAM = "thread";

function createThreadToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveNewThreadTarget(): string {
  return "/chat";
}

export function buildNewThreadHref(options?: { threadToken?: string }): string {
  const url = new URL(resolveNewThreadTarget(), "http://compass.local");
  url.search = "";
  url.searchParams.set(NEW_THREAD_QUERY_PARAM, options?.threadToken ?? createThreadToken());
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function buildThreadHref(threadId: string): string {
  const encoded = encodeURIComponent(threadId.trim());
  return `/chat/${encoded}`;
}
