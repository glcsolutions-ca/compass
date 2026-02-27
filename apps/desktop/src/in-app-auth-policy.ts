import { toHttpOrigin } from "./navigation-policy";

const AUTH_BOOTSTRAP_PATHS = new Set([
  "/v1/auth/entra/start",
  "/v1/auth/entra/admin-consent/start"
]);
const AUTH_PATH_PREFIX = "/v1/auth/";

function parseHttpUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isInAppAuthBootstrapUrl(input: { rawUrl: string; startUrl: string }): boolean {
  const parsed = parseHttpUrl(input.rawUrl);
  if (!parsed) {
    return false;
  }

  const appOrigin = toHttpOrigin(input.startUrl);
  return parsed.origin === appOrigin && AUTH_BOOTSTRAP_PATHS.has(parsed.pathname);
}

export function isInAppAuthNavigationAllowed(input: {
  rawUrl: string;
  startUrl: string;
  authProviderOrigins: ReadonlySet<string>;
}): boolean {
  const parsed = parseHttpUrl(input.rawUrl);
  if (!parsed) {
    return false;
  }

  const appOrigin = toHttpOrigin(input.startUrl);
  return parsed.origin === appOrigin || input.authProviderOrigins.has(parsed.origin);
}

export function isInAppAuthCompletionUrl(input: { rawUrl: string; startUrl: string }): boolean {
  const parsed = parseHttpUrl(input.rawUrl);
  if (!parsed) {
    return false;
  }

  const appOrigin = toHttpOrigin(input.startUrl);
  if (parsed.origin !== appOrigin) {
    return false;
  }

  return !parsed.pathname.startsWith(AUTH_PATH_PREFIX);
}
