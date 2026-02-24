import {
  ApiErrorSchema,
  ApiKeyLoginRequestSchema,
  ApprovalResponseRequestSchema,
  ChatGptLoginCancelRequestSchema,
  ThreadListResponseSchema,
  ThreadReadResponseSchema,
  ThreadStartRequestSchema,
  TurnStartRequestSchema
} from "@compass/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { CodexGateway } from "../codex/gateway.js";
import type { WebSocketHub } from "../realtime/ws-hub.js";
import type { PersistenceRepository } from "../storage/repository.js";
import { CodexRpcError } from "../codex/jsonrpc.js";

export interface RegisterGatewayRoutesOptions {
  gateway: CodexGateway;
  repository: PersistenceRepository;
  hub: WebSocketHub;
}

const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string()
});

export function registerGatewayRoutes(
  app: FastifyInstance,
  options: RegisterGatewayRoutesOptions
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({ status: z.literal("ok") })
        }
      }
    },
    async () => ({ status: "ok" as const })
  );

  typedApp.get(
    "/v1/stream",
    {
      websocket: true
    },
    (connection, request) => {
      const parsed = new URL(request.raw.url ?? request.url, "http://localhost");
      const threadId = parsed.searchParams.get("threadId");
      options.hub.subscribe(connection, threadId);
    }
  );

  typedApp.post(
    "/v1/threads/start",
    {
      schema: {
        body: ThreadStartRequestSchema,
        response: {
          201: z.unknown(),
          500: ApiErrorSchema
        }
      }
    },
    async (request, reply) => {
      const body = ThreadStartRequestSchema.parse(request.body);

      try {
        const result = await options.gateway.request("thread/start", body);
        await options.repository.upsertThread((result as Record<string, unknown>).thread);
        return reply.code(201).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  typedApp.post(
    "/v1/threads/:threadId/turns/start",
    {
      schema: {
        params: z.object({ threadId: z.string().min(1) }),
        body: TurnStartRequestSchema,
        response: {
          202: z.unknown(),
          500: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const body = TurnStartRequestSchema.parse(request.body);
      const { threadId } = request.params;
      const payload = {
        threadId,
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
          threadId,
          (result as Record<string, unknown>).turn,
          payload.input
        );
        return reply.code(202).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  typedApp.post(
    "/v1/threads/:threadId/turns/:turnId/interrupt",
    {
      schema: {
        params: z.object({
          threadId: z.string().min(1),
          turnId: z.string().min(1)
        }),
        response: {
          202: z.object({ ok: z.literal(true) }),
          500: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const { threadId, turnId } = request.params;

      try {
        await options.gateway.request("turn/interrupt", {
          threadId,
          turnId
        });
        return reply.code(202).send({ ok: true as const });
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  typedApp.get(
    "/v1/threads",
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().positive().max(200).default(50)
        }),
        response: {
          200: ThreadListResponseSchema,
          500: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const data = await options.repository.listThreads(request.query.limit);
        return reply.code(200).send({ data });
      } catch (error) {
        return reply.code(500).send(toApiError(error));
      }
    }
  );

  typedApp.get(
    "/v1/threads/:threadId",
    {
      schema: {
        params: z.object({ threadId: z.string().min(1) }),
        response: {
          200: ThreadReadResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const details = await options.repository.readThread(request.params.threadId);
        if (!details) {
          return reply.code(404).send({
            code: "THREAD_NOT_FOUND",
            message: `Thread '${request.params.threadId}' was not found`
          });
        }

        return reply.code(200).send(details);
      } catch (error) {
        return reply.code(500).send(toApiError(error));
      }
    }
  );

  typedApp.post(
    "/v1/approvals/:requestId/respond",
    {
      schema: {
        params: z.object({ requestId: z.string().min(1) }),
        body: ApprovalResponseRequestSchema,
        response: {
          200: z.object({ ok: z.literal(true) }),
          500: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const body = ApprovalResponseRequestSchema.parse(request.body);

      try {
        await options.gateway.respondApproval(request.params.requestId, body.decision);
        return reply.code(200).send({ ok: true as const });
      } catch (error) {
        return reply.code(500).send(toApiError(error));
      }
    }
  );

  typedApp.get(
    "/v1/auth/account",
    {
      schema: {
        response: {
          200: z.unknown(),
          500: ErrorResponseSchema
        }
      }
    },
    async (_request, reply) => {
      try {
        const result = await options.gateway.request("account/read", {
          refreshToken: false
        });
        const payload = result as Record<string, unknown>;
        await options.repository.upsertAuthState(
          extractAuthMode(payload.account),
          payload.account ?? null
        );
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  typedApp.post(
    "/v1/auth/api-key/login",
    {
      schema: {
        body: ApiKeyLoginRequestSchema,
        response: {
          200: z.unknown(),
          500: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const body = ApiKeyLoginRequestSchema.parse(request.body);

      try {
        const result = await options.gateway.request("account/login/start", {
          type: "apiKey",
          apiKey: body.apiKey
        });
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  typedApp.post(
    "/v1/auth/chatgpt/login/start",
    {
      schema: {
        response: {
          200: z.unknown(),
          500: ErrorResponseSchema
        }
      }
    },
    async (_request, reply) => {
      try {
        const result = await options.gateway.request("account/login/start", {
          type: "chatgpt"
        });
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  typedApp.post(
    "/v1/auth/chatgpt/login/cancel",
    {
      schema: {
        body: ChatGptLoginCancelRequestSchema,
        response: {
          200: z.unknown(),
          500: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const body = ChatGptLoginCancelRequestSchema.parse(request.body);

      try {
        const result = await options.gateway.request("account/login/cancel", {
          loginId: body.loginId
        });
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  typedApp.post(
    "/v1/auth/logout",
    {
      schema: {
        response: {
          200: z.unknown(),
          500: ErrorResponseSchema
        }
      }
    },
    async (_request, reply) => {
      try {
        const result = await options.gateway.request("account/logout", {});
        await options.repository.upsertAuthState(null, null);
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );

  typedApp.get(
    "/v1/models",
    {
      schema: {
        querystring: z.object({
          includeHidden: z.coerce.boolean().default(false)
        }),
        response: {
          200: z.unknown(),
          500: ErrorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const result = await options.gateway.request("model/list", {
          includeHidden: request.query.includeHidden
        });
        return reply.code(200).send(result);
      } catch (error) {
        return sendError(reply, error);
      }
    }
  );
}

function sendError(reply: FastifyReply, error: unknown) {
  return (reply as { code: (statusCode: number) => FastifyReply })
    .code(statusFromError(error))
    .send(toApiError(error));
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
