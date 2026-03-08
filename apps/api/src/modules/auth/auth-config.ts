import {
  DEFAULT_OIDC_SCOPE,
  DEFAULT_SESSION_IDLE_TTL_SECONDS,
  DEFAULT_SESSION_TTL_SECONDS,
  SESSION_COOKIE_NAME,
  type EntraAuthConfig,
  type AuthMode,
  ApiError,
  asStringOrNull,
  extractClientIp,
  sanitizeUriScheme
} from "./auth-core.js";

function parseRequiredUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL (received '${value}')`);
  }
}

function resolveAuthUrls({
  webBaseUrlCandidate,
  redirectUriCandidate
}: {
  webBaseUrlCandidate: string;
  redirectUriCandidate?: string;
}): { webBaseUrl: string; redirectUri: string } {
  const webUrl = parseRequiredUrl(webBaseUrlCandidate, "WEB_BASE_URL");
  const webBaseUrl = webUrl.origin;
  const redirectUri =
    redirectUriCandidate ?? `${webBaseUrl.replace(/\/+$/u, "")}/v1/auth/entra/callback`;
  const redirectUrl = parseRequiredUrl(redirectUri, "ENTRA_REDIRECT_URI");

  if (redirectUrl.origin !== webBaseUrl) {
    throw new Error(
      `ENTRA_REDIRECT_URI origin (${redirectUrl.origin}) must match WEB_BASE_URL origin (${webBaseUrl})`
    );
  }

  if (redirectUrl.pathname !== "/v1/auth/entra/callback") {
    throw new Error("ENTRA_REDIRECT_URI path must be '/v1/auth/entra/callback'");
  }

  return {
    webBaseUrl,
    redirectUri: redirectUrl.toString()
  };
}

export function buildEntraAuthConfig(env: NodeJS.ProcessEnv): EntraAuthConfig {
  const rawAuthMode = asStringOrNull(env.AUTH_MODE)?.toLowerCase();
  if (rawAuthMode && rawAuthMode !== "mock" && rawAuthMode !== "entra") {
    throw new Error(`AUTH_MODE must be 'mock' or 'entra' (received '${rawAuthMode}')`);
  }

  const authMode: AuthMode = rawAuthMode === "entra" ? "entra" : "mock";
  const { webBaseUrl, redirectUri } = resolveAuthUrls({
    webBaseUrlCandidate: asStringOrNull(env.WEB_BASE_URL) ?? "http://localhost:3000",
    redirectUriCandidate: asStringOrNull(env.ENTRA_REDIRECT_URI) ?? undefined
  });

  const parseSeconds = (value: string | undefined, fallback: number): number => {
    if (!value || value.trim().length === 0) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  };

  const parseCommaList = (value: string | undefined): string[] => {
    if (!value) {
      return [];
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  return {
    authMode,
    clientId: asStringOrNull(env.ENTRA_CLIENT_ID) ?? undefined,
    clientSecret: asStringOrNull(env.ENTRA_CLIENT_SECRET) ?? undefined,
    oidcStateEncryptionKey: asStringOrNull(env.AUTH_OIDC_STATE_ENCRYPTION_KEY) ?? undefined,
    redirectUri,
    authorityHost: asStringOrNull(env.ENTRA_AUTHORITY_HOST) ?? "https://login.microsoftonline.com",
    tenantSegment: asStringOrNull(env.ENTRA_TENANT_SEGMENT) ?? "organizations",
    allowedTenantIds: parseCommaList(env.ENTRA_ALLOWED_TENANT_IDS),
    scope: asStringOrNull(env.ENTRA_SCOPE) ?? DEFAULT_OIDC_SCOPE,
    webBaseUrl,
    desktopAuthScheme: sanitizeUriScheme(env.DESKTOP_AUTH_SCHEME),
    sessionTtlSeconds: parseSeconds(env.AUTH_SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS),
    sessionIdleTtlSeconds: parseSeconds(
      env.AUTH_SESSION_IDLE_TTL_SECONDS,
      DEFAULT_SESSION_IDLE_TTL_SECONDS
    )
  };
}

export function readSessionTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const pieces = cookieHeader.split(";");
  for (const piece of pieces) {
    const [rawName, ...rest] = piece.trim().split("=");
    if (rawName !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = rest.join("=");
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

export function parseAuthError(error: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message
    };
  }

  return {
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected server error"
  };
}

export function parseActorContext(headers: {
  forwardedFor?: string;
  remoteAddress?: string;
  userAgent?: string;
}): { ip: string; userAgent: string | undefined } {
  return {
    ip: extractClientIp(headers.forwardedFor, headers.remoteAddress),
    userAgent: headers.userAgent
  };
}
