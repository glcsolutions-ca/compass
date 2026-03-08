import type express from "express";

function readHeaderValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string");
    return typeof first === "string" ? first : null;
  }

  return null;
}

function readForwardedToken(value: unknown): string | null {
  const headerValue = readHeaderValue(value);
  if (!headerValue?.trim()) {
    return null;
  }

  const firstToken = headerValue
    .split(",")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);

  return firstToken ?? null;
}

function normalizeRequestProtocol(value: string | null): "http" | "https" | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "http" || normalized === "https") {
    return normalized;
  }

  return null;
}

function isValidRequestHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "localhost") {
    return true;
  }

  if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(normalized)) {
    return normalized.split(".").every((entry) => Number(entry) >= 0 && Number(entry) <= 255);
  }

  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/u.test(
    normalized
  );
}

function parseRequestHost(value: string | null): { hostname: string; port: string } | null {
  if (!value) {
    return null;
  }

  const candidate = value.trim().toLowerCase();
  if (!candidate || /[\s/@\\?#]/u.test(candidate)) {
    return null;
  }

  try {
    const parsed = new URL(`https://${candidate}`);
    if (
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    if (!isValidRequestHostname(parsed.hostname)) {
      return null;
    }

    if (parsed.port) {
      const numericPort = Number(parsed.port);
      if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
        return null;
      }
    }

    return {
      hostname: parsed.hostname,
      port: parsed.port
    };
  } catch {
    return null;
  }
}

export function buildAllowedOrigins(
  explicitOrigins: string[] | undefined,
  webBaseUrlFromEnv: string | undefined
): Set<string> {
  const origins = new Set<string>();
  const candidates = [...(explicitOrigins ?? []), webBaseUrlFromEnv ?? "http://localhost:3000"];

  for (const value of candidates) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    try {
      origins.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed origin candidates from environment or config.
    }
  }

  return origins;
}

export function resolveBrowserFacingOrigin(request: express.Request): string | null {
  const forwardedProto = readForwardedToken(request.headers["x-forwarded-proto"]);
  const protocol =
    normalizeRequestProtocol(forwardedProto) ?? normalizeRequestProtocol(request.protocol);
  if (!protocol) {
    return null;
  }

  const forwardedHost = readForwardedToken(request.headers["x-forwarded-host"]);
  const hostHeader = readHeaderValue(request.headers.host);
  const host = parseRequestHost(forwardedHost ?? hostHeader);
  if (!host) {
    return null;
  }

  const includePort =
    host.port.length > 0 &&
    !((protocol === "https" && host.port === "443") || (protocol === "http" && host.port === "80"));
  const authority = includePort ? `${host.hostname}:${host.port}` : host.hostname;

  return `${protocol}://${authority}`;
}

export function resolveAuthRedirectUri(request: express.Request): string | null {
  const origin = resolveBrowserFacingOrigin(request);
  if (!origin) {
    return null;
  }

  return `${origin}/v1/auth/entra/callback`;
}

export function readRequestOrigin(request: express.Request): string | null {
  const origin = readHeaderValue(request.headers.origin);
  if (origin?.trim()) {
    return origin.trim();
  }

  const referer = readHeaderValue(request.headers.referer);
  if (!referer?.trim()) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
