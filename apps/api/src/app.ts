import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type ErrorRequestHandler, type Express, type Response } from "express";
import {
  TenantCreateRequestSchema,
  TenantInviteCreateRequestSchema,
  buildOpenApiDocument
} from "@compass/contracts";
import { z } from "zod";
import {
  type AuthService,
  parseActorContext,
  parseAuthError,
  readSessionTokenFromCookie
} from "./auth-service.js";

interface JsonParseError extends Error {
  status?: number;
  type?: string;
}

interface ApiAppOptions {
  now?: () => Date;
  authService?: AuthService | null;
  allowedOrigins?: string[];
  authRateLimitWindowMs?: number;
  authRateLimitMaxRequests?: number;
  authRateLimitMaxEntries?: number;
}

const TenantSlugParamsSchema = z.object({
  tenantSlug: z.string().min(1)
});

const InviteTokenParamsSchema = z.object({
  tenantSlug: z.string().min(1),
  token: z.string().min(1)
});

const EntraStartQuerySchema = z.object({
  returnTo: z.string().optional()
});

const EntraAdminConsentQuerySchema = z.object({
  tenantHint: z.string().optional(),
  returnTo: z.string().optional()
});

const EntraCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  admin_consent: z.string().optional(),
  tenant: z.string().optional(),
  scope: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

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

function parseOrReply<T>(value: unknown, schema: z.ZodSchema<T>, response: Response): T | null {
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
  const readHeaderValue = (value: unknown): string | null => {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === "string");
      return typeof first === "string" ? first : null;
    }

    return null;
  };

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

export function buildApiApp(options: ApiAppOptions = {}): Express {
  const now = options.now ?? (() => new Date());
  const authService = options.authService ?? null;
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

    response.status(403).json({
      code: "CSRF_ORIGIN_DENIED",
      message: "Cross-origin state-changing requests are not allowed"
    });
  });

  const openapi = buildOpenApiDocument();

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: now().toISOString()
    });
  });

  app.get("/openapi.json", (_req, res) => {
    res.status(200).json(openapi);
  });

  app.get("/v1/ping", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "api"
    });
  });

  app.get("/v1/auth/entra/start", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const query = parseOrReply(request.query, EntraStartQuerySchema, response);
    if (!query) {
      return;
    }

    const actor = actorContextFromRequest(request);
    const rateResult = authRateLimiter.check({
      key: `entra-start:${actor.ip}`,
      now: now()
    });
    if (!rateResult.allowed) {
      response.setHeader("retry-after", String(rateResult.retryAfterSeconds));
      response.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many authentication requests"
      });
      return;
    }

    try {
      const result = await authService.startEntraLogin({
        returnTo: query.returnTo,
        userAgent: actor.userAgent,
        ip: actor.ip,
        now: now()
      });

      if (result.sessionToken) {
        response.setHeader("set-cookie", authService.createSessionCookie(result.sessionToken));
      }

      response.redirect(302, result.redirectUrl);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.get("/v1/auth/entra/admin-consent/start", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const query = parseOrReply(request.query, EntraAdminConsentQuerySchema, response);
    if (!query) {
      return;
    }

    const actor = actorContextFromRequest(request);
    const rateResult = authRateLimiter.check({
      key: `entra-admin-consent:${actor.ip}`,
      now: now()
    });
    if (!rateResult.allowed) {
      response.setHeader("retry-after", String(rateResult.retryAfterSeconds));
      response.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many authentication requests"
      });
      return;
    }

    try {
      const result = await authService.startAdminConsent({
        tenantHint: query.tenantHint,
        returnTo: query.returnTo,
        now: now()
      });
      response.redirect(302, result.redirectUrl);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.get("/v1/auth/entra/callback", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const query = parseOrReply(request.query, EntraCallbackQuerySchema, response);
    if (!query) {
      return;
    }

    const actorContext = actorContextFromRequest(request);
    const rateResult = authRateLimiter.check({
      key: `entra-callback:${actorContext.ip}`,
      now: now()
    });
    if (!rateResult.allowed) {
      response.setHeader("retry-after", String(rateResult.retryAfterSeconds));
      response.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many authentication requests"
      });
      return;
    }

    try {
      const result = await authService.handleEntraCallback({
        code: query.code,
        state: query.state,
        adminConsent: query.admin_consent,
        tenant: query.tenant,
        scope: query.scope,
        error: query.error,
        errorDescription: query.error_description,
        userAgent: actorContext.userAgent,
        ip: actorContext.ip,
        now: now()
      });

      if (result.sessionToken) {
        response.setHeader("set-cookie", authService.createSessionCookie(result.sessionToken));
      }

      response.redirect(302, result.redirectTo);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.get("/v1/auth/me", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    try {
      const result = await authService.readAuthMe({
        sessionToken: currentSessionToken(request),
        now: now()
      });

      response.status(200).json(result);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.post("/v1/auth/logout", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    try {
      await authService.logout({
        sessionToken: currentSessionToken(request),
        now: now()
      });

      response.setHeader("set-cookie", authService.clearSessionCookie());
      response.status(204).send();
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.post("/v1/tenants", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const body = parseOrReply(request.body, TenantCreateRequestSchema, response);
    if (!body) {
      return;
    }

    try {
      const result = await authService.createTenant({
        sessionToken: currentSessionToken(request),
        request: body,
        now: now()
      });

      response.status(201).json(result);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.get("/v1/tenants/:tenantSlug", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const params = parseOrReply(request.params, TenantSlugParamsSchema, response);
    if (!params) {
      return;
    }

    try {
      const result = await authService.readTenant({
        sessionToken: currentSessionToken(request),
        tenantSlug: params.tenantSlug,
        now: now()
      });
      response.status(200).json(result);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.get("/v1/tenants/:tenantSlug/members", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const params = parseOrReply(request.params, TenantSlugParamsSchema, response);
    if (!params) {
      return;
    }

    try {
      const result = await authService.listTenantMembers({
        sessionToken: currentSessionToken(request),
        tenantSlug: params.tenantSlug,
        now: now()
      });
      response.status(200).json(result);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.post("/v1/tenants/:tenantSlug/invites", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const params = parseOrReply(request.params, TenantSlugParamsSchema, response);
    if (!params) {
      return;
    }

    const body = parseOrReply(request.body, TenantInviteCreateRequestSchema, response);
    if (!body) {
      return;
    }

    try {
      const result = await authService.createTenantInvite({
        sessionToken: currentSessionToken(request),
        tenantSlug: params.tenantSlug,
        request: body,
        now: now()
      });
      response.status(201).json(result);
    } catch (error) {
      sendAuthError(request, response, error);
    }
  });

  app.post("/v1/tenants/:tenantSlug/invites/:token/accept", async (request, response) => {
    if (!authService) {
      response.status(503).json({ code: "AUTH_NOT_CONFIGURED", message: "Auth is not configured" });
      return;
    }

    const params = parseOrReply(request.params, InviteTokenParamsSchema, response);
    if (!params) {
      return;
    }

    try {
      const result = await authService.acceptTenantInvite({
        sessionToken: currentSessionToken(request),
        tenantSlug: params.tenantSlug,
        inviteToken: params.token,
        now: now()
      });
      response.status(200).json(result);
    } catch (error) {
      sendAuthError(request, response, error);
    }
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
