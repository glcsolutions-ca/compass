import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type ErrorRequestHandler, type Express, type Response } from "express";
import { type ExecutionMode, buildOpenApiDocument } from "@compass/contracts";
import type { ZodType, ZodTypeDef } from "zod";
import {
  type AuthService,
  parseActorContext,
  parseAuthError,
  readSessionTokenFromCookie
} from "../modules/auth/auth-service.js";
import type { ThreadService } from "../modules/threads/thread-service.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { registerRuntimeRoutes } from "./routes/runtime-routes.js";
import { registerSystemRoutes } from "./routes/system-routes.js";
import { registerThreadRoutes } from "./routes/thread-routes.js";
import { registerWorkspaceRoutes } from "./routes/workspace-routes.js";

interface JsonParseError extends Error {
  status?: number;
  type?: string;
}

interface ApiAppOptions {
  now?: () => Date;
  authService?: AuthService | null;
  threadService?: ThreadService | null;
  agentGatewayEnabled?: boolean;
  agentCloudModeEnabled?: boolean;
  agentLocalModeEnabledDesktop?: boolean;
  agentModeSwitchEnabled?: boolean;
  allowedOrigins?: string[];
  authRateLimitWindowMs?: number;
  authRateLimitMaxRequests?: number;
  authRateLimitMaxEntries?: number;
}

const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS = 30;
const DEFAULT_AUTH_RATE_LIMIT_MAX_ENTRIES = 10_000;

interface RateLimitState {
  count: number;
  resetAtMs: number;
}

class InMemoryRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, RateLimitState>();

  constructor(input: { windowMs: number; maxRequests: number; maxEntries: number }) {
    this.windowMs = input.windowMs;
    this.maxRequests = input.maxRequests;
    this.maxEntries = input.maxEntries;
  }

  check(input: { key: string; now: Date }): { allowed: boolean; retryAfterSeconds: number } {
    const nowMs = input.now.getTime();
    this.pruneExpiredEntries(nowMs);

    const existing = this.entries.get(input.key);
    if (!existing || existing.resetAtMs <= nowMs) {
      this.entries.set(input.key, {
        count: 1,
        resetAtMs: nowMs + this.windowMs
      });
      this.enforceEntryCap();
      return { allowed: true, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
    }

    if (existing.count >= this.maxRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000))
      };
    }

    existing.count += 1;
    this.entries.set(input.key, existing);
    return {
      allowed: true,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000))
    };
  }

  private pruneExpiredEntries(nowMs: number): void {
    for (const [key, state] of this.entries) {
      if (state.resetAtMs <= nowMs) {
        this.entries.delete(key);
      }
    }
  }

  private enforceEntryCap(): void {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== "string") {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }
}

function isMalformedJsonError(error: unknown): error is JsonParseError {
  if (!(error instanceof SyntaxError)) {
    return false;
  }

  const parseError = error as JsonParseError;
  return parseError.status === 400 && parseError.type === "entity.parse.failed";
}

function parseOrReply<T>(
  value: unknown,
  schema: ZodType<T, ZodTypeDef, unknown>,
  response: Response
): T | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  const firstIssue = parsed.error.issues.at(0);
  response.status(400).json({
    code: "INVALID_REQUEST",
    message: firstIssue?.message ?? "Invalid request"
  });
  return null;
}

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

function resolveBrowserFacingOrigin(request: express.Request): string | null {
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

function resolveAuthRedirectUri(request: express.Request): string | null {
  const origin = resolveBrowserFacingOrigin(request);
  if (!origin) {
    return null;
  }

  return `${origin}/v1/auth/entra/callback`;
}

function currentSessionToken(request: express.Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (Array.isArray(cookieHeader)) {
    return readSessionTokenFromCookie(cookieHeader.join(";"));
  }

  return readSessionTokenFromCookie(cookieHeader);
}

function actorContextFromRequest(request: express.Request): {
  ip: string;
  userAgent: string | undefined;
} {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor.at(0) : forwardedFor;

  const userAgent = request.headers["user-agent"];
  const userAgentValue = Array.isArray(userAgent) ? userAgent.at(0) : userAgent;

  return parseActorContext({
    forwardedFor: forwardedValue,
    remoteAddress: request.socket.remoteAddress,
    userAgent: userAgentValue
  });
}

function requestIdFromRequest(request: express.Request): string {
  const fromLocals = (request.res?.locals as Record<string, unknown> | undefined)?.requestId;
  return typeof fromLocals === "string" && fromLocals.trim().length > 0 ? fromLocals : "unknown";
}

function logUnhandledError(input: {
  request: express.Request;
  error: unknown;
  parsed: { status: number; code: string; message: string };
}): void {
  const base = {
    event: "api.auth.unhandled_error",
    requestId: requestIdFromRequest(input.request),
    method: input.request.method,
    path: input.request.originalUrl,
    code: input.parsed.code,
    status: input.parsed.status
  };

  if (input.error instanceof Error) {
    console.error(
      JSON.stringify({
        ...base,
        error: {
          name: input.error.name,
          message: input.error.message,
          stack: input.error.stack
        }
      })
    );
    return;
  }

  console.error(
    JSON.stringify({
      ...base,
      error: {
        value: String(input.error)
      }
    })
  );
}

function parseRequestIdCandidate(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string");
    return parseRequestIdCandidate(first);
  }

  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function sendAuthError(request: express.Request, response: express.Response, error: unknown): void {
  const parsed = parseAuthError(error);
  if (parsed.status >= 500) {
    logUnhandledError({
      request,
      error,
      parsed
    });
  }
  response.status(parsed.status).json({
    code: parsed.code,
    message: parsed.message
  });
}

function buildAllowedOrigins(
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
      // ignore malformed origin candidates
    }
  }

  return origins;
}

function readRequestOrigin(request: express.Request): string | null {
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

function shouldApplyCsrfCheck(request: express.Request): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return false;
  }

  return currentSessionToken(request) !== null;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseFeatureFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  return value.trim().toLowerCase() === "true";
}

export function buildApiApp(options: ApiAppOptions = {}): Express {
  const now = options.now ?? (() => new Date());
  const authService = options.authService ?? null;
  const threadService = options.threadService ?? null;
  const agentGatewayEnabled =
    options.agentGatewayEnabled ?? parseFeatureFlag(process.env.AGENT_GATEWAY_ENABLED, false);
  const agentCloudModeEnabled =
    options.agentCloudModeEnabled ?? parseFeatureFlag(process.env.AGENT_CLOUD_MODE_ENABLED, false);
  const agentLocalModeEnabledDesktop =
    options.agentLocalModeEnabledDesktop ??
    parseFeatureFlag(process.env.AGENT_LOCAL_MODE_ENABLED_DESKTOP, false);
  const agentModeSwitchEnabled =
    options.agentModeSwitchEnabled ??
    parseFeatureFlag(process.env.AGENT_MODE_SWITCH_ENABLED, false);
  const allowedOrigins = buildAllowedOrigins(options.allowedOrigins, process.env.WEB_BASE_URL);
  const authRateLimiter = new InMemoryRateLimiter({
    windowMs:
      options.authRateLimitWindowMs ??
      parsePositiveInteger(
        process.env.AUTH_RATE_LIMIT_WINDOW_MS,
        DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS
      ),
    maxRequests:
      options.authRateLimitMaxRequests ??
      parsePositiveInteger(
        process.env.AUTH_RATE_LIMIT_MAX_REQUESTS,
        DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS
      ),
    maxEntries:
      options.authRateLimitMaxEntries ??
      parsePositiveInteger(
        process.env.AUTH_RATE_LIMIT_MAX_ENTRIES,
        DEFAULT_AUTH_RATE_LIMIT_MAX_ENTRIES
      )
  });

  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  app.use(express.json());
  app.use((request, response, next) => {
    const requestId =
      parseRequestIdCandidate(request.headers["x-request-id"]) ??
      parseRequestIdCandidate(request.headers["x-correlation-id"]) ??
      randomUUID();

    response.locals.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  });

  app.use((request, response, next) => {
    if (!shouldApplyCsrfCheck(request)) {
      next();
      return;
    }

    const requestOrigin = readRequestOrigin(request);
    if (!requestOrigin) {
      response.status(403).json({
        code: "CSRF_ORIGIN_REQUIRED",
        message: "Origin header is required for state-changing requests"
      });
      return;
    }

    if (allowedOrigins.has(requestOrigin)) {
      next();
      return;
    }

    const browserOrigin = resolveBrowserFacingOrigin(request);
    if (browserOrigin && requestOrigin === browserOrigin) {
      next();
      return;
    }

    response.status(403).json({
      code: "CSRF_ORIGIN_DENIED",
      message: "Cross-origin state-changing requests are not allowed"
    });
  });

  const openapi = buildOpenApiDocument();

  registerSystemRoutes({
    app,
    now,
    openapi
  });

  registerAuthRoutes({
    app,
    now,
    authService,
    authRateLimiter,
    parseOrReply,
    actorContextFromRequest,
    currentSessionToken,
    resolveAuthRedirectUri,
    sendAuthError
  });

  registerWorkspaceRoutes({
    app,
    now,
    authService,
    parseOrReply,
    currentSessionToken,
    sendAuthError
  });

  async function requireThreadContext(
    request: express.Request,
    response: express.Response
  ): Promise<{ userId: string; service: ThreadService } | null> {
    if (!agentGatewayEnabled) {
      response.status(503).json({
        code: "AGENT_GATEWAY_DISABLED",
        message: "Thread gateway is disabled"
      });
      return null;
    }

    if (!authService || !threadService) {
      response.status(503).json({
        code: "AGENT_GATEWAY_NOT_CONFIGURED",
        message: "Thread gateway is not configured"
      });
      return null;
    }

    try {
      const authMe = await authService.readAuthMe({
        sessionToken: currentSessionToken(request),
        now: now()
      });

      if (!authMe.authenticated || !authMe.user?.id) {
        response.status(401).json({
          code: "UNAUTHORIZED",
          message: "Authentication required"
        });
        return null;
      }

      return {
        userId: authMe.user.id,
        service: threadService
      };
    } catch (error) {
      sendAuthError(request, response, error);
      return null;
    }
  }

  async function withThreadContext(
    request: express.Request,
    response: express.Response,
    handler: (context: { userId: string; service: ThreadService }) => Promise<void>
  ): Promise<void> {
    const context = await requireThreadContext(request, response);
    if (!context) {
      return;
    }

    try {
      await handler(context);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  }

  function ensureExecutionModeEnabled(
    response: express.Response,
    executionMode: ExecutionMode | undefined
  ): boolean {
    if (executionMode === "cloud" && !agentCloudModeEnabled) {
      response.status(503).json({
        code: "AGENT_CLOUD_MODE_DISABLED",
        message: "Cloud mode is disabled"
      });
      return false;
    }

    if (executionMode === "local" && !agentLocalModeEnabledDesktop) {
      response.status(503).json({
        code: "AGENT_LOCAL_MODE_DISABLED",
        message: "Local mode is disabled"
      });
      return false;
    }

    return true;
  }

  function ensureModeSwitchEnabled(response: express.Response): boolean {
    if (agentModeSwitchEnabled) {
      return true;
    }

    response.status(503).json({
      code: "AGENT_MODE_SWITCH_DISABLED",
      message: "Mode switching is disabled"
    });
    return false;
  }

  registerRuntimeRoutes({
    app,
    now,
    parseOrReply,
    withThreadContext
  });

  registerThreadRoutes({
    app,
    now,
    parseOrReply,
    withThreadContext,
    ensureExecutionModeEnabled,
    ensureModeSwitchEnabled
  });

  app.use((_req, res) => {
    res.status(404).json({
      code: "NOT_FOUND",
      message: "Route not found"
    });
  });

  const malformedJsonHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (!isMalformedJsonError(error)) {
      next(error);
      return;
    }

    res.status(400).json({
      code: "INVALID_JSON",
      message: "Malformed JSON request body"
    });
  };
  app.use(malformedJsonHandler);

  const defaultErrorHandler: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(500).json({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error"
    });
  };
  app.use(defaultErrorHandler);

  return app;
}
