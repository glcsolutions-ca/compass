function normalizeSegment(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function resolveNewThreadTarget(_workspaceSlug?: string): string {
  return "/chat";
}

export function buildNewThreadHref(options: {
  workspaceSlug?: string;
  threadToken?: string;
}): string {
  void options;
  return "/chat";
}

export function buildThreadHref(threadHandle: string): string {
  const normalizedThreadHandle = normalizeSegment(threadHandle);
  if (!normalizedThreadHandle) {
    return "/chat";
  }

  return `/chat/${encodeURIComponent(normalizedThreadHandle)}`;
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
