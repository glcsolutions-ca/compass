import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  ApiErrorSchema,
  AuthMeResponseSchema,
  HealthResponseSchema,
  PingResponseSchema,
  WorkspaceCreateRequestSchema,
  WorkspaceCreateResponseSchema,
  WorkspaceInviteAcceptResponseSchema,
  WorkspaceInviteCreateRequestSchema,
  WorkspaceInviteCreateResponseSchema,
  WorkspaceMembersResponseSchema,
  WorkspaceReadResponseSchema
} from "./schemas.js";
import {
  AgentEventsBatchRequestSchema,
  AgentEventsBatchResponseSchema,
  AgentEventsListResponseSchema,
  AgentThreadCreateRequestSchema,
  AgentThreadCreateResponseSchema,
  AgentThreadModePatchRequestSchema,
  AgentThreadModePatchResponseSchema,
  AgentThreadReadResponseSchema,
  AgentTurnInterruptResponseSchema,
  AgentTurnStartRequestSchema,
  AgentTurnStartResponseSchema
} from "./agent-gateway.js";

export const API_VERSION = "v1";

let zodExtended = false;

function ensureZodExtended() {
  if (!zodExtended) {
    extendZodWithOpenApi(z);
    zodExtended = true;
  }
}

export function buildOpenApiDocument(): Record<string, unknown> {
  ensureZodExtended();

  const registry = new OpenAPIRegistry();
  registry.register("HealthResponse", HealthResponseSchema);
  registry.register("PingResponse", PingResponseSchema);
  registry.register("ApiError", ApiErrorSchema);
  registry.register("AuthMeResponse", AuthMeResponseSchema);
  registry.register("WorkspaceCreateRequest", WorkspaceCreateRequestSchema);
  registry.register("WorkspaceCreateResponse", WorkspaceCreateResponseSchema);
  registry.register("WorkspaceReadResponse", WorkspaceReadResponseSchema);
  registry.register("WorkspaceMembersResponse", WorkspaceMembersResponseSchema);
  registry.register("WorkspaceInviteCreateRequest", WorkspaceInviteCreateRequestSchema);
  registry.register("WorkspaceInviteCreateResponse", WorkspaceInviteCreateResponseSchema);
  registry.register("WorkspaceInviteAcceptResponse", WorkspaceInviteAcceptResponseSchema);
  registry.register("AgentThreadCreateRequest", AgentThreadCreateRequestSchema);
  registry.register("AgentThreadCreateResponse", AgentThreadCreateResponseSchema);
  registry.register("AgentThreadReadResponse", AgentThreadReadResponseSchema);
  registry.register("AgentThreadModePatchRequest", AgentThreadModePatchRequestSchema);
  registry.register("AgentThreadModePatchResponse", AgentThreadModePatchResponseSchema);
  registry.register("AgentTurnStartRequest", AgentTurnStartRequestSchema);
  registry.register("AgentTurnStartResponse", AgentTurnStartResponseSchema);
  registry.register("AgentTurnInterruptResponse", AgentTurnInterruptResponseSchema);
  registry.register("AgentEventsBatchRequest", AgentEventsBatchRequestSchema);
  registry.register("AgentEventsBatchResponse", AgentEventsBatchResponseSchema);
  registry.register("AgentEventsListResponse", AgentEventsListResponseSchema);

  registry.registerComponent("securitySchemes", "sessionCookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "__Host-compass_session",
    description: "Opaque server-side session cookie"
  });

  registry.registerPath({
    method: "get",
    path: "/health",
    operationId: "getHealth",
    summary: "Get API health status",
    tags: ["System"],
    responses: {
      200: {
        description: "API health status",
        content: {
          "application/json": {
            schema: HealthResponseSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "get",
    path: "/v1/ping",
    operationId: "getPing",
    summary: "Get API ping response",
    tags: ["System"],
    responses: {
      200: {
        description: "API ping response",
        content: {
          "application/json": {
            schema: PingResponseSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "get",
    path: "/v1/auth/entra/start",
    operationId: "startEntraLogin",
    summary: "Start Entra login flow",
    tags: ["Auth"],
    request: {
      query: z.object({
        returnTo: z.string().optional()
      })
    },
    responses: {
      302: {
        description: "Redirect to Entra authorize endpoint"
      },
      400: {
        description: "Invalid request",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      429: {
        description: "Rate limited",
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
    path: "/v1/auth/entra/callback",
    operationId: "handleEntraCallback",
    summary: "Handle Entra callback and establish session",
    tags: ["Auth"],
    request: {
      query: z.object({
        code: z.string().optional(),
        state: z.string().optional(),
        admin_consent: z.string().optional(),
        tenant: z.string().optional(),
        scope: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional()
      })
    },
    responses: {
      302: {
        description: "Redirect to workspace or return target"
      },
      400: {
        description: "Invalid callback state or token",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      401: {
        description: "Authentication failed",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      403: {
        description: "Tenant not allowed",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      429: {
        description: "Rate limited",
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
    path: "/v1/auth/entra/admin-consent/start",
    operationId: "startEntraAdminConsent",
    summary: "Start Entra admin consent flow",
    tags: ["Auth"],
    request: {
      query: z.object({
        tenantHint: z.string().optional(),
        returnTo: z.string().optional()
      })
    },
    responses: {
      302: {
        description: "Redirect to Entra admin consent endpoint"
      },
      429: {
        description: "Rate limited",
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
    path: "/v1/auth/me",
    operationId: "getAuthMe",
    summary: "Return current authenticated user with organizations and workspaces",
    tags: ["Auth"],
    security: [{ sessionCookieAuth: [] }],
    responses: {
      200: {
        description: "Authenticated context",
        content: {
          "application/json": {
            schema: AuthMeResponseSchema
          }
        }
      },
      401: {
        description: "No active session",
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
    path: "/v1/auth/logout",
    operationId: "logout",
    summary: "Revoke current session",
    tags: ["Auth"],
    security: [{ sessionCookieAuth: [] }],
    responses: {
      204: {
        description: "Session revoked"
      }
    }
  });

  registry.registerPath({
    method: "post",
    path: "/v1/workspaces",
    operationId: "createWorkspace",
    summary: "Create a workspace",
    tags: ["Workspaces"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: WorkspaceCreateRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        description: "Workspace created",
        content: {
          "application/json": {
            schema: WorkspaceCreateResponseSchema
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
      }
    }
  });

  registry.registerPath({
    method: "get",
    path: "/v1/workspaces/{workspaceSlug}",
    operationId: "getWorkspace",
    summary: "Read workspace metadata",
    tags: ["Workspaces"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        workspaceSlug: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Workspace details",
        content: {
          "application/json": {
            schema: WorkspaceReadResponseSchema
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
        description: "Workspace not found",
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
    path: "/v1/workspaces/{workspaceSlug}/members",
    operationId: "listWorkspaceMembers",
    summary: "List workspace members",
    tags: ["Workspaces"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        workspaceSlug: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Workspace members",
        content: {
          "application/json": {
            schema: WorkspaceMembersResponseSchema
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
        description: "Workspace not found",
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
    path: "/v1/workspaces/{workspaceSlug}/invites",
    operationId: "createWorkspaceInvite",
    summary: "Create workspace invite",
    tags: ["Workspaces"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        workspaceSlug: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: WorkspaceInviteCreateRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        description: "Invite created",
        content: {
          "application/json": {
            schema: WorkspaceInviteCreateResponseSchema
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
        description: "Workspace not found",
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
    path: "/v1/workspaces/{workspaceSlug}/invites/{token}/accept",
    operationId: "acceptWorkspaceInvite",
    summary: "Accept workspace invite",
    tags: ["Workspaces"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        workspaceSlug: z.string().min(1),
        token: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Invite accepted",
        content: {
          "application/json": {
            schema: WorkspaceInviteAcceptResponseSchema
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
        description: "Invite not found",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      409: {
        description: "Invite already accepted by another user",
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
    path: "/v1/agent/threads",
    operationId: "createAgentThread",
    summary: "Create an agent thread",
    tags: ["Agent"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: AgentThreadCreateRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        description: "Agent thread created",
        content: {
          "application/json": {
            schema: AgentThreadCreateResponseSchema
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
    path: "/v1/agent/threads/{threadId}",
    operationId: "getAgentThread",
    summary: "Read an agent thread",
    tags: ["Agent"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Agent thread state",
        content: {
          "application/json": {
            schema: AgentThreadReadResponseSchema
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
    path: "/v1/agent/threads/{threadId}/mode",
    operationId: "patchAgentThreadMode",
    summary: "Switch execution mode for an agent thread",
    tags: ["Agent"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: AgentThreadModePatchRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Thread mode updated",
        content: {
          "application/json": {
            schema: AgentThreadModePatchResponseSchema
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
    path: "/v1/agent/threads/{threadId}/turns",
    operationId: "createAgentTurn",
    summary: "Start a turn for an agent thread",
    tags: ["Agent"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: AgentTurnStartRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Turn accepted and processed",
        content: {
          "application/json": {
            schema: AgentTurnStartResponseSchema
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
    path: "/v1/agent/threads/{threadId}/turns/{turnId}/interrupt",
    operationId: "interruptAgentTurn",
    summary: "Interrupt an in-progress turn",
    tags: ["Agent"],
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
            schema: AgentTurnInterruptResponseSchema
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
    path: "/v1/agent/threads/{threadId}/events:batch",
    operationId: "appendAgentThreadEventsBatch",
    summary: "Append externally sourced events to a thread",
    tags: ["Agent"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        threadId: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: AgentEventsBatchRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Events accepted",
        content: {
          "application/json": {
            schema: AgentEventsBatchResponseSchema
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
    path: "/v1/agent/threads/{threadId}/events",
    operationId: "listAgentThreadEvents",
    summary: "List persisted thread events",
    tags: ["Agent"],
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
            schema: AgentEventsListResponseSchema
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
    path: "/v1/agent/threads/{threadId}/stream",
    operationId: "streamAgentThreadEvents",
    summary: "Upgrade to websocket stream for thread events",
    tags: ["Agent"],
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

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Compass API",
      version: API_VERSION,
      description: "Compass API baseline with Entra-first organization/workspace auth"
    },
    servers: [{ url: "http://localhost:3001" }],
    tags: [
      { name: "System", description: "Platform system endpoints" },
      { name: "Auth", description: "Authentication and session endpoints" },
      { name: "Workspaces", description: "Workspace membership and invite endpoints" },
      { name: "Agent", description: "Agent thread and turn orchestration endpoints" }
    ]
  }) as unknown as Record<string, unknown>;
}
