import {
  AuthAccountReadResponseSchema,
  AuthLoginStartResponseSchema,
  ApiKeyLoginRequestSchema,
  ApprovalResponseRequestSchema,
  ChatGptLoginCancelRequestSchema,
  ThreadStartRequestSchema,
  TurnStartRequestSchema
} from "@compass/contracts";
import type { Express, Response } from "express";
import { z } from "zod";
import type { CodexGateway } from "../codex/gateway.js";
import { CodexRpcError } from "../codex/jsonrpc.js";
import type { PersistenceRepository } from "../storage/repository.js";

export interface RegisterGatewayRoutesOptions {
  gateway: CodexGateway;
  repository: PersistenceRepository;
}

const ParamsThreadIdSchema = z.object({
  threadId: z.string().min(1)
});

const ParamsThreadTurnSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1)
});

const ParamsApprovalSchema = z.object({
  requestId: z.string().min(1)
});

const ModelsQuerySchema = z.object({
  includeHidden: z.coerce.boolean().default(false)
});

export function registerGatewayRoutes(app: Express, options: RegisterGatewayRoutesOptions): void {
  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/v1/stream", (_request, response) => {
    response.status(426).json({
      code: "UPGRADE_REQUIRED",
      message: "Use a websocket upgrade request for /v1/stream"
    });
  });

  app.post("/v1/threads/start", async (request, response) => {
    const body = parseOrReply(request.body, ThreadStartRequestSchema, response);
    if (!body) {
      return;
    }

    try {
      const result = await options.gateway.request("thread/start", body);
      await options.repository.upsertThread((result as Record<string, unknown>).thread);
      response.status(201).json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/threads/:threadId/turns/start", async (request, response) => {
    const params = parseOrReply(request.params, ParamsThreadIdSchema, response);
    if (!params) {
      return;
    }

    const body = parseOrReply(request.body, TurnStartRequestSchema, response);
    if (!body) {
      return;
    }

    const payload = {
      threadId: params.threadId,
      input: [
        {
          type: "text",
          text: body.text
        }
      ],
      cwd: body.cwd,
      model: body.model,
      approvalPolicy: body.approvalPolicy,
      sandboxPolicy: body.sandboxPolicy,
      effort: body.effort,
      personality: body.personality
    };

    try {
      const result = await options.gateway.request("turn/start", payload);
      await options.repository.upsertTurn(
        params.threadId,
        (result as Record<string, unknown>).turn,
        payload.input
      );
      response.status(202).json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/threads/:threadId/turns/:turnId/interrupt", async (request, response) => {
    const params = parseOrReply(request.params, ParamsThreadTurnSchema, response);
    if (!params) {
      return;
    }

    try {
      await options.gateway.request("turn/interrupt", {
        threadId: params.threadId,
        turnId: params.turnId
      });
      response.status(202).json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/approvals/:requestId/respond", async (request, response) => {
    const params = parseOrReply(request.params, ParamsApprovalSchema, response);
    if (!params) {
      return;
    }

    const body = parseOrReply(request.body, ApprovalResponseRequestSchema, response);
    if (!body) {
      return;
    }

    try {
      await options.gateway.respondApproval(params.requestId, body.decision);
      response.status(200).json({ ok: true });
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/v1/auth/account", async (_request, response) => {
    try {
      const result = await options.gateway.request("account/read", {
        refreshToken: false
      });
      const payload = AuthAccountReadResponseSchema.parse(result);
      await options.repository.upsertAuthState(
        extractAuthMode(payload.account),
        payload.account ?? null
      );
      response.status(200).json(payload);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/auth/api-key/login", async (request, response) => {
    const body = parseOrReply(request.body, ApiKeyLoginRequestSchema, response);
    if (!body) {
      return;
    }

    try {
      const result = await options.gateway.request("account/login/start", {
        type: "apiKey",
        apiKey: body.apiKey
      });
      response.status(200).json(AuthLoginStartResponseSchema.parse(result));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/auth/chatgpt/login/start", async (_request, response) => {
    try {
      const result = await options.gateway.request("account/login/start", {
        type: "chatgpt"
      });
      response.status(200).json(AuthLoginStartResponseSchema.parse(result));
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/auth/chatgpt/login/cancel", async (request, response) => {
    const body = parseOrReply(request.body, ChatGptLoginCancelRequestSchema, response);
    if (!body) {
      return;
    }

    try {
      const result = await options.gateway.request("account/login/cancel", {
        loginId: body.loginId
      });
      response.status(200).json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.post("/v1/auth/logout", async (_request, response) => {
    try {
      const result = await options.gateway.request("account/logout", {});
      await options.repository.upsertAuthState(null, null);
      response.status(200).json(result);
    } catch (error) {
      sendError(response, error);
    }
  });

  app.get("/v1/models", async (request, response) => {
    const query = parseOrReply(request.query, ModelsQuerySchema, response);
    if (!query) {
      return;
    }

    try {
      const result = await options.gateway.request("model/list", {
        includeHidden: query.includeHidden
      });
      response.status(200).json(result);
    } catch (error) {
      sendError(response, error);
    }
  });
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

function sendError(response: Response, error: unknown): void {
  response.status(statusFromError(error)).json(toApiError(error));
}

function statusFromError(error: unknown): number {
  if (error instanceof CodexRpcError) {
    if (error.code === -32001) {
      return 503;
    }

    if (error.code === -32600 || error.code === -32601 || error.code === -32602) {
      return 400;
    }

    if (error.code === 401) {
      return 401;
    }
  }

  return 500;
}

function toApiError(error: unknown): { code: string; message: string } {
  if (error instanceof CodexRpcError) {
    return {
      code: `RPC_${error.code}`,
      message: error.message
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Unknown error"
  };
}

function extractAuthMode(account: unknown): string | null {
  if (!account || typeof account !== "object") {
    return null;
  }

  const type = (account as Record<string, unknown>).type;
  return typeof type === "string" ? type : null;
}

export const __private__ = {
  statusFromError,
  toApiError
};
