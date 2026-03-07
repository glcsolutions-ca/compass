import { type OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  RuntimeAccountLoginCancelRequestSchema,
  RuntimeAccountLoginCancelResponseSchema,
  RuntimeAccountLoginStartRequestSchema,
  RuntimeAccountLoginStartResponseSchema,
  RuntimeAccountLogoutResponseSchema,
  RuntimeAccountRateLimitsReadResponseSchema,
  RuntimeAccountReadRequestSchema,
  RuntimeAccountReadResponseSchema
} from "../thread-runtime-gateway.js";
import { ApiErrorSchema } from "../schemas.js";

export function registerRuntimeOpenApiPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: "post",
    path: "/v1/runtime/account/read",
    operationId: "postRuntimeAccountRead",
    summary: "Read Codex runtime account state",
    tags: ["Runtime"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: RuntimeAccountReadRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Runtime account state",
        content: {
          "application/json": {
            schema: RuntimeAccountReadResponseSchema
          }
        }
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      503: {
        description: "Runtime unavailable",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "post",
    path: "/v1/runtime/account/login/start",
    operationId: "postRuntimeAccountLoginStart",
    summary: "Start Codex runtime account login",
    tags: ["Runtime"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: RuntimeAccountLoginStartRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Runtime login start response",
        content: {
          "application/json": {
            schema: RuntimeAccountLoginStartResponseSchema
          }
        }
      },
      400: {
        description: "Invalid request or unsupported provider",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      503: {
        description: "Runtime unavailable",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "post",
    path: "/v1/runtime/account/login/cancel",
    operationId: "postRuntimeAccountLoginCancel",
    summary: "Cancel pending runtime login",
    tags: ["Runtime"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: RuntimeAccountLoginCancelRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Runtime login cancel status",
        content: {
          "application/json": {
            schema: RuntimeAccountLoginCancelResponseSchema
          }
        }
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      503: {
        description: "Runtime unavailable",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "post",
    path: "/v1/runtime/account/logout",
    operationId: "postRuntimeAccountLogout",
    summary: "Logout runtime account",
    tags: ["Runtime"],
    security: [{ sessionCookieAuth: [] }],
    responses: {
      200: {
        description: "Runtime account logout result",
        content: {
          "application/json": {
            schema: RuntimeAccountLogoutResponseSchema
          }
        }
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      503: {
        description: "Runtime unavailable",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "post",
    path: "/v1/runtime/account/rate-limits/read",
    operationId: "postRuntimeAccountRateLimitsRead",
    summary: "Read runtime account rate limits",
    tags: ["Runtime"],
    security: [{ sessionCookieAuth: [] }],
    responses: {
      200: {
        description: "Runtime account rate limits",
        content: {
          "application/json": {
            schema: RuntimeAccountRateLimitsReadResponseSchema
          }
        }
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      503: {
        description: "Runtime unavailable",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "get",
    path: "/v1/runtime/stream",
    operationId: "getRuntimeStream",
    summary: "Runtime notification websocket stream",
    tags: ["Runtime"],
    security: [{ sessionCookieAuth: [] }],
    responses: {
      426: {
        description: "Use websocket upgrade for this endpoint",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });
}
