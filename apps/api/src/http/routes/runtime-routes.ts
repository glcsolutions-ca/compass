import {
  type RuntimeAccountLoginCancelRequest,
  RuntimeAccountLoginCancelRequestSchema,
  type RuntimeAccountLoginStartRequest,
  RuntimeAccountLoginStartRequestSchema,
  type RuntimeAccountReadRequest,
  RuntimeAccountReadRequestSchema
} from "@compass/contracts";
import type { ThreadServiceRoutesContext } from "./route-context.js";

export function registerRuntimeRoutes(input: ThreadServiceRoutesContext): void {
  input.app.post("/v1/runtime/account/read", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const body = input.parseOrReply<RuntimeAccountReadRequest>(
        request.body,
        RuntimeAccountReadRequestSchema,
        response
      );
      if (!body) {
        return;
      }

      const state = await service.readRuntimeAccountState({
        userId,
        refreshToken: body.refreshToken
      });
      response.status(200).json(state);
    });
  });

  input.app.post("/v1/runtime/account/login/start", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const body = input.parseOrReply<RuntimeAccountLoginStartRequest>(
        request.body,
        RuntimeAccountLoginStartRequestSchema,
        response
      );
      if (!body) {
        return;
      }

      const result = await service.startRuntimeAccountLogin({
        userId,
        request: body
      });
      response.status(200).json(result);
    });
  });

  input.app.post("/v1/runtime/account/login/cancel", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const body = input.parseOrReply<RuntimeAccountLoginCancelRequest>(
        request.body,
        RuntimeAccountLoginCancelRequestSchema,
        response
      );
      if (!body) {
        return;
      }

      const result = await service.cancelRuntimeAccountLogin({
        userId,
        loginId: body.loginId
      });
      response.status(200).json(result);
    });
  });

  input.app.post("/v1/runtime/account/logout", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const result = await service.logoutRuntimeAccount({
        userId
      });
      response.status(200).json(result);
    });
  });

  input.app.post("/v1/runtime/account/rate-limits/read", async (request, response) => {
    await input.withThreadContext(request, response, async ({ userId, service }) => {
      const result = await service.readRuntimeRateLimits({
        userId
      });
      response.status(200).json(result);
    });
  });

  input.app.get("/v1/runtime/stream", async (_request, response) => {
    response.status(426).json({
      code: "UPGRADE_REQUIRED",
      message: "Use websocket upgrade for this endpoint"
    });
  });
}
