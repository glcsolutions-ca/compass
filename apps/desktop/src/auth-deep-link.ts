const DEFAULT_DESKTOP_AUTH_SCHEME = "ca.glsolutions.compass";

export interface ParsedDesktopAuthDeepLink {
  handoffToken: string | null;
  nextPath: string | null;
}

function isSafeAppPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return false;
  }

  try {
    const parsed = new URL(value, "https://compass.local");
    return parsed.origin === "https://compass.local";
  } catch {
    return false;
  }
}

export function resolveDesktopAuthScheme(env: NodeJS.ProcessEnv): string {
  const configured = env.DESKTOP_AUTH_SCHEME?.trim().toLowerCase();
  if (!configured) {
    return DEFAULT_DESKTOP_AUTH_SCHEME;
  }

  return /^[a-z][a-z0-9+.-]*$/u.test(configured) ? configured : DEFAULT_DESKTOP_AUTH_SCHEME;
}

export function extractDeepLinkFromArgv(
  argv: readonly string[],
  scheme: string = DEFAULT_DESKTOP_AUTH_SCHEME
): string | null {
  const prefix = `${scheme.toLowerCase()}://`;

  for (const arg of argv) {
    if (arg.toLowerCase().startsWith(prefix)) {
      return arg;
    }
  }

  return null;
}

export function parseDesktopAuthDeepLink(
  rawUrl: string,
  scheme: string = DEFAULT_DESKTOP_AUTH_SCHEME
): ParsedDesktopAuthDeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${scheme.toLowerCase()}:`) {
    return null;
  }

  if (parsed.hostname !== "auth" || parsed.pathname !== "/callback") {
    return null;
  }

  const handoffToken = parsed.searchParams.get("handoff")?.trim() || null;
  if (handoffToken) {
    return {
      handoffToken,
      nextPath: null
    };
  }

  const nextPath = parsed.searchParams.get("next")?.trim() || null;
  if (!nextPath || !isSafeAppPath(nextPath)) {
    return null;
  }

  return {
    handoffToken: null,
    nextPath
  };
}

export function resolveDeepLinkNavigationTarget(input: {
  startUrl: string;
  deepLink: ParsedDesktopAuthDeepLink;
}): string {
  const base = new URL(input.startUrl);

  if (input.deepLink.handoffToken) {
    const url = new URL("/v1/auth/desktop/complete", base);
    url.searchParams.set("handoff", input.deepLink.handoffToken);
    return url.toString();
  }

  const nextPath = input.deepLink.nextPath || "/login";
  return new URL(nextPath, base).toString();
}
