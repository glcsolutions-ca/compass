import cors from "cors";
import express, { type ErrorRequestHandler, type Express, type Response } from "express";
import { type ExecutionMode, buildOpenApiDocument } from "@compass/contracts";
import type { ZodType, ZodTypeDef } from "zod";
import { type AuthService } from "../modules/auth/auth-service.js";
import type { ThreadService } from "../modules/threads/thread-service.js";
import {
  DEFAULT_AUTH_RATE_LIMIT_MAX_ENTRIES,
  DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS,
  InMemoryRateLimiter
} from "./auth-rate-limiter.js";
import {
  actorContextFromRequest,
  currentSessionToken,
  resolveRequestId,
  sendAuthError
} from "./request-context.js";
import {
  buildAllowedOrigins,
  readRequestOrigin,
  resolveAuthRedirectUri,
  resolveBrowserFacingOrigin
} from "./request-origin.js";
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
    const requestId = resolveRequestId(request);
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
