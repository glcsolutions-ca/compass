import {
  type ExecutionMode,
  ThreadEventsBatchRequestSchema,
  ThreadEventsQuerySchema,
  ThreadParamsSchema,
  ThreadCreateRequestSchema,
  ThreadListQuerySchema,
  ThreadModePatchRequestSchema,
  ThreadPatchRequestSchema,
  ThreadTurnParamsSchema,
  TurnStartRequestSchema,
  type ThreadEventsBatchRequest,
  type ThreadListQuery,
  type ThreadModePatchRequest,
  type ThreadPatchRequest,
  type TurnStartRequest
} from "../../modules/threads/threads-schemas.js";
import type { ThreadRoutesContext } from "./route-context.js";

function ensureExecutionModeEnabled(
  input: ThreadRoutesContext,
  response: Parameters<ThreadRoutesContext["ensureExecutionModeEnabled"]>[0],
  executionMode: ExecutionMode | undefined
): boolean {
  return input.ensureExecutionModeEnabled(response, executionMode);
}

export function registerThreadRoutes(input: ThreadRoutesContext): void {
  input.app.get("/v1/threads", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const query = input.parseOrReply<ThreadListQuery>(
        request.query,
        ThreadListQuerySchema,
        response
      );
      if (!query) {
        return;
      }

      const threads = await service.listThreads({
        userId,
        workspaceSlug: query.workspaceSlug,
        state: query.state,
        limit: query.limit
      });
      response.status(200).json({ threads });
    });
  });

  input.app.post("/v1/threads", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const body = input.parseOrReply(request.body, ThreadCreateRequestSchema, response);
      if (!body) {
        return;
      }

      if (!ensureExecutionModeEnabled(input, response, body.executionMode)) {
        return;
      }

      const thread = await service.createThread({
        userId,
        workspaceSlug: body.workspaceSlug,
        executionMode: body.executionMode ?? "cloud",
        executionHost: body.executionHost,
        title: body.title,
        now: input.now()
      });
      response.status(201).json({ thread });
    });
  });

  input.app.get("/v1/threads/:threadId", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadParamsSchema, response);
      if (!params) {
        return;
      }

      const thread = await service.readThread({
        userId,
        threadId: params.threadId
      });
      response.status(200).json({ thread });
    });
  });

  input.app.patch("/v1/threads/:threadId", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadParamsSchema, response);
      if (!params) {
        return;
      }

      const body = input.parseOrReply<ThreadPatchRequest>(
        request.body,
        ThreadPatchRequestSchema,
        response
      );
      if (!body) {
        return;
      }

      const thread = await service.updateThread({
        userId,
        threadId: params.threadId,
        title: body.title,
        archived: body.archived,
        now: input.now()
      });
      response.status(200).json({ thread });
    });
  });

  input.app.delete("/v1/threads/:threadId", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadParamsSchema, response);
      if (!params) {
        return;
      }

      const deleted = await service.deleteThread({
        userId,
        threadId: params.threadId,
        now: input.now()
      });
      response.status(200).json(deleted);
    });
  });

  input.app.patch("/v1/threads/:threadId/mode", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadParamsSchema, response);
      if (!params) {
        return;
      }

      const body = input.parseOrReply<ThreadModePatchRequest>(
        request.body,
        ThreadModePatchRequestSchema,
        response
      );
      if (!body) {
        return;
      }

      if (!input.ensureModeSwitchEnabled(response)) {
        return;
      }

      if (!ensureExecutionModeEnabled(input, response, body.executionMode)) {
        return;
      }

      const thread = await service.switchThreadMode({
        userId,
        threadId: params.threadId,
        executionMode: body.executionMode,
        executionHost: body.executionHost,
        now: input.now()
      });
      response.status(200).json({ thread });
    });
  });

  input.app.post("/v1/threads/:threadId/runtime/launch", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadParamsSchema, response);
      if (!params) {
        return;
      }

      const result = await service.issueThreadRuntimeLaunch({
        userId,
        threadId: params.threadId
      });
      response.status(200).json(result);
    });
  });

  input.app.post("/v1/threads/:threadId/turns", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadParamsSchema, response);
      if (!params) {
        return;
      }

      const body = input.parseOrReply<TurnStartRequest>(
        request.body,
        TurnStartRequestSchema,
        response
      );
      if (!body) {
        return;
      }

      if (!ensureExecutionModeEnabled(input, response, body.executionMode)) {
        return;
      }

      const result = await service.startTurn({
        userId,
        threadId: params.threadId,
        text: body.text,
        clientRequestId: body.clientRequestId,
        parentTurnId: body.parentTurnId,
        sourceTurnId: body.sourceTurnId,
        executionMode: body.executionMode,
        executionHost: body.executionHost,
        now: input.now()
      });
      response.status(200).json(result);
    });
  });

  input.app.post("/v1/threads/:threadId/turns/:turnId/interrupt", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadTurnParamsSchema, response);
      if (!params) {
        return;
      }

      const turn = await service.interruptTurn({
        userId,
        threadId: params.threadId,
        turnId: params.turnId,
        now: input.now()
      });
      response.status(200).json({ turn });
    });
  });

  input.app.post("/v1/threads/:threadId/events:batch", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadParamsSchema, response);
      if (!params) {
        return;
      }

      const body = input.parseOrReply<ThreadEventsBatchRequest>(
        request.body,
        ThreadEventsBatchRequestSchema,
        response
      );
      if (!body) {
        return;
      }

      const result = await service.appendThreadEventsBatch({
        userId,
        threadId: params.threadId,
        events: body.events.map((event: ThreadEventsBatchRequest["events"][number]) => ({
          turnId: event.turnId,
          method: event.method,
          payload: event.payload ?? {}
        })),
        now: input.now()
      });
      response.status(200).json(result);
    });
  });

  input.app.get("/v1/threads/:threadId/events", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const params = input.parseOrReply(request.params, ThreadParamsSchema, response);
      if (!params) {
        return;
      }

      const query = input.parseOrReply(request.query, ThreadEventsQuerySchema, response);
      if (!query) {
        return;
      }

      const events = await service.listThreadEvents({
        userId,
        threadId: params.threadId,
        cursor: query.cursor,
        limit: query.limit
      });
      response.status(200).json({ events });
    });
  });

  input.app.get("/v1/threads/:threadId/stream", async (_request, response) => {
    response.status(426).json({
      code: "UPGRADE_REQUIRED",
      message: "Use websocket upgrade for this endpoint"
    });
  });
}
