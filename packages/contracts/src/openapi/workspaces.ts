import { type OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  ApiErrorSchema,
  WorkspaceCreateRequestSchema,
  WorkspaceCreateResponseSchema,
  WorkspaceInviteAcceptResponseSchema,
  WorkspaceInviteCreateRequestSchema,
  WorkspaceInviteCreateResponseSchema,
  WorkspaceMembersResponseSchema,
  WorkspaceReadResponseSchema
} from "../schemas.js";

export function registerWorkspaceOpenApiPaths(registry: OpenAPIRegistry): void {
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
}
