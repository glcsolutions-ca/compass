import type { NextRequest } from "next/server";
import { parseSessionCookie, serializeSession, type SessionPayload } from "./session-cookie";
import {
  parseSsoCookie,
  refreshSsoCookie,
  serializeSsoCookie,
  SSO_COOKIE_NAME
} from "../../../auth/sso-cookie";
import { loadWebAuthRuntimeConfig, resolveSessionSecret } from "../../../auth/runtime-config";

export const runtime = "nodejs";

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const UPSTREAM_TIMEOUT_MS = 10_000;
const SESSION_COOKIE_NAME = "__Host-compass_session";
const CSRF_COOKIE_NAME = "__Host-compass_csrf";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
  "traceparent",
  "tracestate",
  "baggage",
  "x-correlation-id",
  "x-request-id"
]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface RouteContext {
  params: Promise<{
    path: string[];
  }>;
}

function resolveApiBaseUrl() {
  const configured = process.env.API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return DEFAULT_API_BASE_URL;
}

function toUpstreamUrl(baseUrl: string, requestUrl: string, pathSegments: string[] = []) {
  const incomingUrl = new URL(requestUrl);
  const encodedPath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  const suffix = encodedPath.length > 0 ? `/${encodedPath}` : "";
  return `${baseUrl}/v1${suffix}${incomingUrl.search}`;
}

function buildUpstreamRequestHeaders(requestHeaders: Headers, accessToken: string | null) {
  const headers = new Headers();

  for (const [name, value] of requestHeaders.entries()) {
    const normalizedName = name.toLowerCase();
    if (!FORWARDED_REQUEST_HEADERS.has(normalizedName)) {
      continue;
    }
    if (HOP_BY_HOP_HEADERS.has(normalizedName)) {
      continue;
    }
    headers.set(name, value);
  }

  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  return headers;
}

function buildDownstreamResponseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers();

  for (const [name, value] of upstreamHeaders.entries()) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    headers.set(name, value);
  }

  return headers;
}

function isMutatingMethod(method: string) {
  return MUTATING_METHODS.has(method.toUpperCase());
}

function isHighRiskPath(path: string[]) {
  if (path.length >= 3 && path[0] === "tenants" && path[2] === "roles") {
    return true;
  }

  return path.length > 0 && path[0] === "scim";
}

function requiresSession(path: string[]) {
  return !(path[0] === "oauth" && path[1] === "token");
}

function requiresSso(path: string[]) {
  if (path[0] === "health") {
    return false;
  }

  if (path[0] === "oauth" && path[1] === "token") {
    return false;
  }

  return true;
}

function allowedOrigins(requestUrl: string) {
  const incoming = new URL(requestUrl);
  const sameOrigin = `${incoming.protocol}//${incoming.host}`;
  const configured = process.env.WEB_ALLOWED_ORIGINS?.trim();
  if (!configured) {
    return new Set([sameOrigin]);
  }

  return new Set(
    configured
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .concat(sameOrigin)
  );
}

function hasValidBrowserOrigin(request: NextRequest) {
  const origins = allowedOrigins(request.url);
  const origin = request.headers.get("origin");
  if (origin && origins.has(origin)) {
    return true;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return false;
  }

  try {
    const refererOrigin = new URL(referer).origin;
    return origins.has(refererOrigin);
  } catch {
    return false;
  }
}

function jsonError(
  status: number,
  payload: {
    error: string;
    code: string;
  }
) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store"
    }
  });
}

function sessionCookieValue(payload: SessionPayload, secret: string) {
  return `${SESSION_COOKIE_NAME}=${serializeSession(payload, secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`;
}

function ssoCookieValue(payload: ReturnType<typeof refreshSsoCookie>, secret: string) {
  return `${SSO_COOKIE_NAME}=${serializeSsoCookie(payload, secret)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`;
}

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const apiBaseUrl = resolveApiBaseUrl();
  if (!apiBaseUrl) {
    return jsonError(500, {
      error: "API base URL is not configured",
      code: "API_BASE_URL_REQUIRED"
    });
  }

  const { path } = await context.params;
  const authConfig = loadWebAuthRuntimeConfig();
  const secret = resolveSessionSecret();
  if (!secret) {
    return jsonError(500, {
      error: "WEB_SESSION_SECRET is not configured",
      code: "SESSION_SECRET_REQUIRED"
    });
  }

  let ssoSession: ReturnType<typeof parseSsoCookie> | null = null;
  if (authConfig.entraLoginEnabled && !authConfig.devFallbackEnabled && requiresSso(path)) {
    const rawSsoCookie = request.cookies.get(SSO_COOKIE_NAME)?.value;
    ssoSession = parseSsoCookie(rawSsoCookie, secret);
    if (!ssoSession) {
      return jsonError(401, {
        error: "Valid enterprise SSO session is required",
        code: "SSO_REQUIRED"
      });
    }
  }

  let session: SessionPayload | null = null;
  if (requiresSession(path)) {
    const rawSessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    session = parseSessionCookie(rawSessionCookie, secret);
    if (!session) {
      return jsonError(401, {
        error: "Valid session is required",
        code: "SESSION_REQUIRED"
      });
    }

    if (isMutatingMethod(request.method)) {
      const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
      const csrfHeader = request.headers.get("x-csrf-token");
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return jsonError(403, {
          error: "CSRF token validation failed",
          code: "CSRF_VALIDATION_FAILED"
        });
      }

      if (!hasValidBrowserOrigin(request)) {
        return jsonError(403, {
          error: "Origin validation failed",
          code: "ORIGIN_VALIDATION_FAILED"
        });
      }

      if (isHighRiskPath(path) && request.headers.get("x-compass-step-up") !== "true") {
        return jsonError(403, {
          error: "Step-up authentication required",
          code: "STEP_UP_REQUIRED"
        });
      }
    }
  }

  const upstreamUrl = toUpstreamUrl(apiBaseUrl, request.url, path);
  const headers = buildUpstreamRequestHeaders(request.headers, session?.token ?? null);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store"
    });

    const responseHeaders = buildDownstreamResponseHeaders(upstreamResponse.headers);
    if (ssoSession) {
      responseHeaders.append("set-cookie", ssoCookieValue(refreshSsoCookie(ssoSession), secret));
    }
    if (session) {
      const refreshed: SessionPayload = {
        ...session,
        lastSeenAtMs: Date.now()
      };
      responseHeaders.append("set-cookie", sessionCookieValue(refreshed, secret));
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders
    });
  } catch {
    return jsonError(502, {
      error: "Upstream API request failed",
      code: "UPSTREAM_UNAVAILABLE"
    });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
