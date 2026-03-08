import { randomUUID } from "node:crypto";
import type express from "express";
import {
  parseActorContext,
  parseAuthError,
  readSessionTokenFromCookie
} from "../modules/auth/auth-service.js";

export function currentSessionToken(request: express.Request): string | null {
  const cookieHeader = request.headers.cookie;
  if (Array.isArray(cookieHeader)) {
    return readSessionTokenFromCookie(cookieHeader.join(";"));
  }

  return readSessionTokenFromCookie(cookieHeader);
}

export function actorContextFromRequest(request: express.Request): {
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

export function resolveRequestId(request: express.Request): string {
  return (
    parseRequestIdCandidate(request.headers["x-request-id"]) ??
    parseRequestIdCandidate(request.headers["x-correlation-id"]) ??
    randomUUID()
  );
}

export function sendAuthError(
  request: express.Request,
  response: express.Response,
  error: unknown
): void {
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
