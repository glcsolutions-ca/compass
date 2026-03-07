import { type OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ApiErrorSchema, AuthMeResponseSchema } from "../schemas.js";

export function registerAuthOpenApiPaths(registry: OpenAPIRegistry): void {
  registry.registerPath({
    method: "get",
    path: "/v1/auth/entra/start",
    operationId: "startEntraLogin",
    summary: "Start Entra login flow",
    tags: ["Auth"],
    request: {
      query: z.object({
        returnTo: z.string().optional(),
        client: z.enum(["browser", "desktop"]).optional()
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
        returnTo: z.string().optional(),
        client: z.enum(["browser", "desktop"]).optional()
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
    path: "/v1/auth/desktop/complete",
    operationId: "completeDesktopLogin",
    summary: "Complete desktop auth handoff and set session cookie",
    tags: ["Auth"],
    request: {
      query: z.object({
        handoff: z.string().min(1)
      })
    },
    responses: {
      302: {
        description: "Redirect to app route with established session or login guidance"
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
}
