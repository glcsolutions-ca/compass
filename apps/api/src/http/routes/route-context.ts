import type { ExecutionMode } from "@compass/contracts";
import type { Express, Request, Response } from "express";
import type { ZodType, ZodTypeDef } from "zod";
import type { AuthService } from "../../modules/auth/auth-service.js";
import type { ThreadService } from "../../modules/threads/thread-service.js";
import type { WorkspacesService } from "../../modules/workspaces/workspaces-service.js";

export interface AuthRateLimiter {
  check(input: { key: string; now: Date }): { allowed: boolean; retryAfterSeconds: number };
}

export interface ThreadRouteActor {
  userId: string;
  service: ThreadService;
}

export interface RouteSharedContext {
  app: Express;
  now: () => Date;
  parseOrReply: <T>(
    value: unknown,
    schema: ZodType<T, ZodTypeDef, unknown>,
    response: Response
  ) => T | null;
}

export interface SystemRoutesContext {
  app: Express;
  now: () => Date;
  openapi: unknown;
}

export interface AuthRoutesContext extends RouteSharedContext {
  authService: AuthService | null;
  authRateLimiter: AuthRateLimiter;
  actorContextFromRequest(request: Request): { ip: string; userAgent: string | undefined };
  currentSessionToken(request: Request): string | null;
  resolveAuthRedirectUri(request: Request): string | null;
  sendAuthError(request: Request, response: Response, error: unknown): void;
}

export interface WorkspaceRoutesContext extends RouteSharedContext {
  workspacesService: WorkspacesService | null;
  currentSessionToken(request: Request): string | null;
  sendAuthError(request: Request, response: Response, error: unknown): void;
}

export interface ThreadServiceRoutesContext extends RouteSharedContext {
  withThreadContext(
    request: Request,
    response: Response,
    handler: (context: ThreadRouteActor) => Promise<void>
  ): Promise<void>;
}

export interface ThreadRoutesContext extends ThreadServiceRoutesContext {
  ensureExecutionModeEnabled(response: Response, executionMode: ExecutionMode | undefined): boolean;
  ensureModeSwitchEnabled(response: Response): boolean;
}
