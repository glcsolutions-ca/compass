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
  TenantCreateRequestSchema,
  TenantCreateResponseSchema,
  TenantInviteAcceptResponseSchema,
  TenantInviteCreateRequestSchema,
  TenantInviteCreateResponseSchema,
  TenantMembersResponseSchema,
  TenantReadResponseSchema
} from "./schemas.js";

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
  registry.register("TenantCreateRequest", TenantCreateRequestSchema);
  registry.register("TenantCreateResponse", TenantCreateResponseSchema);
  registry.register("TenantReadResponse", TenantReadResponseSchema);
  registry.register("TenantMembersResponse", TenantMembersResponseSchema);
  registry.register("TenantInviteCreateRequest", TenantInviteCreateRequestSchema);
  registry.register("TenantInviteCreateResponse", TenantInviteCreateResponseSchema);
  registry.register("TenantInviteAcceptResponse", TenantInviteAcceptResponseSchema);

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
    summary: "Return current authenticated user and memberships",
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
    path: "/v1/tenants",
    operationId: "createTenant",
    summary: "Create a tenant and owner membership",
    tags: ["Tenants"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: TenantCreateRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        description: "Tenant created",
        content: {
          "application/json": {
            schema: TenantCreateResponseSchema
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
    path: "/v1/tenants/{tenantSlug}",
    operationId: "getTenant",
    summary: "Read tenant metadata",
    tags: ["Tenants"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        tenantSlug: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Tenant details",
        content: {
          "application/json": {
            schema: TenantReadResponseSchema
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
        description: "Tenant not found",
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
    path: "/v1/tenants/{tenantSlug}/members",
    operationId: "listTenantMembers",
    summary: "List tenant members",
    tags: ["Tenants"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        tenantSlug: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Tenant members",
        content: {
          "application/json": {
            schema: TenantMembersResponseSchema
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
        description: "Tenant not found",
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
    path: "/v1/tenants/{tenantSlug}/invites",
    operationId: "createTenantInvite",
    summary: "Create tenant invite",
    tags: ["Tenants"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        tenantSlug: z.string().min(1)
      }),
      body: {
        content: {
          "application/json": {
            schema: TenantInviteCreateRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        description: "Invite created",
        content: {
          "application/json": {
            schema: TenantInviteCreateResponseSchema
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
        description: "Tenant not found",
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
    path: "/v1/tenants/{tenantSlug}/invites/{token}/accept",
    operationId: "acceptTenantInvite",
    summary: "Accept tenant invite",
    tags: ["Tenants"],
    security: [{ sessionCookieAuth: [] }],
    request: {
      params: z.object({
        tenantSlug: z.string().min(1),
        token: z.string().min(1)
      })
    },
    responses: {
      200: {
        description: "Invite accepted",
        content: {
          "application/json": {
            schema: TenantInviteAcceptResponseSchema
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

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Compass API",
      version: API_VERSION,
      description: "Compass API baseline with Entra-first multi-tenant auth"
    },
    servers: [{ url: "http://localhost:3001" }],
    tags: [
      { name: "System", description: "Platform system endpoints" },
      { name: "Auth", description: "Authentication and session endpoints" },
      { name: "Tenants", description: "Tenant membership and invite endpoints" }
    ]
  }) as unknown as Record<string, unknown>;
}
