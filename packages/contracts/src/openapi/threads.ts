import { type OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  ThreadEventsBatchRequestSchema,
  ThreadEventsBatchResponseSchema,
  ThreadEventsListResponseSchema,
  ThreadCreateRequestSchema,
  ThreadCreateResponseSchema,
  ThreadDeleteResponseSchema,
  ThreadListQuerySchema,
  ThreadListResponseSchema,
  ThreadModePatchRequestSchema,
  ThreadModePatchResponseSchema,
  ThreadPatchRequestSchema,
  ThreadPatchResponseSchema,
  ThreadReadResponseSchema,
  ThreadRuntimeLaunchResponseSchema,
  TurnInterruptResponseSchema,
  TurnStartRequestSchema,
  TurnStartResponseSchema
} from "../thread-runtime-gateway.js";
import { ApiErrorSchema } from "../schemas.js";

export function registerThreadOpenApiPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: "get",
    path: "/v1/threads",
    operationId: "listThreads",
    summary: "List threads for a workspace",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      query: ThreadListQuerySchema
    },
    responses: {
      200: {
        description: "Threads",
        content: {
          "application/json": {
            schema: ThreadListResponseSchema
          }
        }
      },
      400: {
        description: "Invalid request",
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
      403: {
        description: "Forbidden",
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
    path: "/v1/threads",
    operationId: "createThread",
    summary: "Create a thread",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: ThreadCreateRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        description: "Thread created",
        content: {
          "application/json": {
            schema: ThreadCreateResponseSchema
          }
        }
      },
      400: {
        description: "Invalid request",
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
      403: {
        description: "Forbidden",
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
    path: "/v1/threads/{threadId}",
    operationId: "getThread",
    summary: "Read a thread",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Thread state",
        content: {
          "application/json": {
            schema: ThreadReadResponseSchema
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Thread not found",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "patch",
    path: "/v1/threads/{threadId}",
    operationId: "patchThread",
    summary: "Update thread metadata",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: ThreadPatchRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Updated thread",
        content: {
          "application/json": {
            schema: ThreadPatchResponseSchema
          }
        }
      },
      400: {
        description: "Invalid request",
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Thread not found",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "delete",
    path: "/v1/threads/{threadId}",
    operationId: "deleteThread",
    summary: "Delete a thread",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Thread deleted",
        content: {
          "application/json": {
            schema: ThreadDeleteResponseSchema
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Thread not found",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "patch",
    path: "/v1/threads/{threadId}/mode",
    operationId: "patchThreadMode",
    summary: "Switch execution mode for a thread",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: ThreadModePatchRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Thread mode updated",
        content: {
          "application/json": {
            schema: ThreadModePatchResponseSchema
          }
        }
      },
      400: {
        description: "Invalid request",
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      409: {
        description: "Thread mode switch conflict",
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
    path: "/v1/threads/{threadId}/runtime/launch",
    operationId: "launchThreadRuntime",
    summary: "Create a desktop-local runtime launch bundle",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Runtime launch bundle created",
        content: {
          "application/json": {
            schema: ThreadRuntimeLaunchResponseSchema
          }
        }
      },
      400: {
        description: "Invalid request",
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Thread not found",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      503: {
        description: "Runtime launch unavailable",
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
    path: "/v1/threads/{threadId}/turns",
    operationId: "createTurn",
    summary: "Start a turn for a thread",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: TurnStartRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Turn accepted and processed",
        content: {
          "application/json": {
            schema: TurnStartResponseSchema
          }
        }
      },
      400: {
        description: "Invalid request",
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Thread not found",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      409: {
        description: "Turn conflict",
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
    path: "/v1/threads/{threadId}/turns/{turnId}/interrupt",
    operationId: "interruptTurn",
    summary: "Interrupt an in-progress turn",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1),
        turnId: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Turn interrupted",
        content: {
          "application/json": {
            schema: TurnInterruptResponseSchema
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Thread/turn not found",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      409: {
        description: "Turn state conflict",
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
    path: "/v1/threads/{threadId}/events:batch",
    operationId: "appendThreadEventsBatch",
    summary: "Append externally sourced events to a thread",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: ThreadEventsBatchRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Events accepted",
        content: {
          "application/json": {
            schema: ThreadEventsBatchResponseSchema
          }
        }
      },
      400: {
        description: "Invalid request",
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
      403: {
        description: "Forbidden",
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
    path: "/v1/threads/{threadId}/events",
    operationId: "listThreadEvents",
    summary: "List persisted thread events",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      query: z.object({
        cursor: z.coerce.number().int().nonnegative().optional(),
        limit: z.coerce.number().int().min(1).max(500).optional()
      })
    },
    responses: {
      200: {
        description: "Thread events",
        content: {
          "application/json": {
            schema: ThreadEventsListResponseSchema
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Thread not found",
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
    path: "/v1/threads/{threadId}/stream",
    operationId: "streamThreadEvents",
    summary: "Upgrade to websocket stream for thread events",
    tags: ["Threads"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      query: z.object({
        cursor: z.coerce.number().int().nonnegative().optional()
      })
    },
    responses: {
      101: {
        description: "WebSocket protocol upgrade accepted"
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Thread not found",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      }
    }
  });
}
