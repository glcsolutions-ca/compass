import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  ApiErrorSchema,
  CreateRoleRequestSchema,
  ForbiddenErrorSchema,
  HealthResponseSchema,
  MePermissionsResponseSchema,
  MeResponseSchema,
  OAuthTokenRequestSchema,
  OAuthTokenResponseSchema,
  RolesResponseSchema,
  ScimGroupSchema,
  ScimOkResponseSchema,
  ScimUserSchema,
  UnauthorizedErrorSchema
} from "./schemas.js";

export const API_VERSION = "v1";

const TenantParamsSchema = z.object({
  tenantId: z.string().min(1)
});

const ResourceIdParamsSchema = z.object({
  id: z.string().min(1)
});

let zodExtended = false;

function ensureZodExtended() {
  if (!zodExtended) {
    extendZodWithOpenApi(z);
    zodExtended = true;
  }
}

function authErrorResponses() {
  return {
    401: {
      description: "Authentication failed",
      content: {
        "application/json": {
          schema: UnauthorizedErrorSchema
        }
      }
    },
    403: {
      description: "Authorization failed",
      content: {
        "application/json": {
          schema: ForbiddenErrorSchema
        }
      }
    }
  };
}

export function buildOpenApiDocument(): Record<string, unknown> {
  ensureZodExtended();
  const registry = new OpenAPIRegistry();

  registry.register("HealthResponse", HealthResponseSchema);
  registry.register("ApiError", ApiErrorSchema);
  registry.register("UnauthorizedError", UnauthorizedErrorSchema);
  registry.register("ForbiddenError", ForbiddenErrorSchema);
  registry.register("MeResponse", MeResponseSchema);
  registry.register("MePermissionsResponse", MePermissionsResponseSchema);
  registry.register("RolesResponse", RolesResponseSchema);
  registry.register("CreateRoleRequest", CreateRoleRequestSchema);
  registry.register("OAuthTokenRequest", OAuthTokenRequestSchema);
  registry.register("OAuthTokenResponse", OAuthTokenResponseSchema);
  registry.register("ScimUser", ScimUserSchema);
  registry.register("ScimGroup", ScimGroupSchema);
  registry.register("ScimOkResponse", ScimOkResponseSchema);

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
    path: "/v1/me",
    operationId: "getMe",
    summary: "Get authenticated caller context",
    tags: ["Auth"],
    security: [{ oauth2: ["compass.user"] }],
    responses: {
      200: {
        description: "Authenticated caller context",
        content: {
          "application/json": {
            schema: MeResponseSchema
          }
        }
      },
      ...authErrorResponses()
    }
  });

  registry.registerPath({
    method: "get",
    path: "/v1/me/permissions",
    operationId: "getMyPermissions",
    summary: "Get effective permissions for authenticated caller",
    tags: ["Auth"],
    security: [{ oauth2: ["compass.user"] }],
    responses: {
      200: {
        description: "Caller permissions",
        content: {
          "application/json": {
            schema: MePermissionsResponseSchema
          }
        }
      },
      ...authErrorResponses()
    }
  });

  registry.registerPath({
    method: "get",
    path: "/v1/tenants/{tenantId}/roles",
    operationId: "listRoles",
    summary: "List tenant role definitions",
    tags: ["RBAC"],
    security: [{ oauth2: ["compass.admin"] }],
    request: {
      params: TenantParamsSchema
    },
    responses: {
      200: {
        description: "Tenant roles",
        content: {
          "application/json": {
            schema: RolesResponseSchema
          }
        }
      },
      ...authErrorResponses()
    }
  });

  registry.registerPath({
    method: "post",
    path: "/v1/tenants/{tenantId}/roles",
    operationId: "createRole",
    summary: "Create a tenant custom role",
    tags: ["RBAC"],
    security: [{ oauth2: ["compass.admin"] }],
    request: {
      params: TenantParamsSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: CreateRoleRequestSchema
          }
        }
      }
    },
    responses: {
      201: {
        description: "Role created",
        content: {
          "application/json": {
            schema: RolesResponseSchema.shape.items.element
          }
        }
      },
      ...authErrorResponses()
    }
  });

  registry.registerPath({
    method: "post",
    path: "/v1/oauth/token",
    operationId: "issueOAuthToken",
    summary: "Issue OAuth2 client credentials token for SCIM and integrations",
    tags: ["OAuth"],
    request: {
      body: {
        required: true,
        content: {
          "application/x-www-form-urlencoded": {
            schema: OAuthTokenRequestSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Issued access token",
        content: {
          "application/json": {
            schema: OAuthTokenResponseSchema
          }
        }
      },
      401: {
        description: "Invalid client credentials",
        content: {
          "application/json": {
            schema: UnauthorizedErrorSchema
          }
        }
      }
    }
  });

  registry.registerPath({
    method: "post",
    path: "/scim/v2/Users",
    operationId: "scimCreateUser",
    summary: "Create or upsert SCIM user",
    tags: ["SCIM"],
    security: [{ oauth2: ["scim.write"] }],
    request: {
      body: {
        required: true,
        content: {
          "application/json": {
            schema: ScimUserSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "SCIM user accepted",
        content: {
          "application/json": {
            schema: ScimOkResponseSchema
          }
        }
      },
      ...authErrorResponses()
    }
  });

  registry.registerPath({
    method: "put",
    path: "/scim/v2/Users/{id}",
    operationId: "scimUpsertUser",
    summary: "Update SCIM user",
    tags: ["SCIM"],
    security: [{ oauth2: ["scim.write"] }],
    request: {
      params: ResourceIdParamsSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: ScimUserSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "SCIM user updated",
        content: {
          "application/json": {
            schema: ScimOkResponseSchema
          }
        }
      },
      ...authErrorResponses()
    }
  });

  registry.registerPath({
    method: "post",
    path: "/scim/v2/Groups",
    operationId: "scimCreateGroup",
    summary: "Create or upsert SCIM group",
    tags: ["SCIM"],
    security: [{ oauth2: ["scim.write"] }],
    request: {
      body: {
        required: true,
        content: {
          "application/json": {
            schema: ScimGroupSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "SCIM group accepted",
        content: {
          "application/json": {
            schema: ScimOkResponseSchema
          }
        }
      },
      ...authErrorResponses()
    }
  });

  registry.registerPath({
    method: "put",
    path: "/scim/v2/Groups/{id}",
    operationId: "scimUpsertGroup",
    summary: "Update SCIM group",
    tags: ["SCIM"],
    security: [{ oauth2: ["scim.write"] }],
    request: {
      params: ResourceIdParamsSchema,
      body: {
        required: true,
        content: {
          "application/json": {
            schema: ScimGroupSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "SCIM group updated",
        content: {
          "application/json": {
            schema: ScimOkResponseSchema
          }
        }
      },
      ...authErrorResponses()
    }
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  const document = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Compass API",
      version: API_VERSION,
      description: "Compass API with Entra-backed authn/authz, SCIM provisioning, and RBAC"
    },
    servers: [{ url: "http://localhost:3001" }],
    tags: [
      { name: "System", description: "Platform system endpoints" },
      { name: "Auth", description: "Authenticated caller endpoints" },
      { name: "RBAC", description: "Tenant role management" },
      { name: "OAuth", description: "OAuth2 token endpoints" },
      { name: "SCIM", description: "SCIM provisioning endpoints" }
    ]
  }) as unknown as Record<string, unknown>;

  const components = ((document as { components?: Record<string, unknown> }).components ??= {});
  components.securitySchemes = {
    oauth2: {
      type: "oauth2",
      description: "Compass OAuth2/Entra token flows",
      flows: {
        authorizationCode: {
          authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          scopes: {
            "compass.user": "Delegated user access",
            "compass.admin": "Delegated admin access",
            "scim.write": "SCIM provisioning access"
          }
        },
        clientCredentials: {
          tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          scopes: {
            "compass.integration.read": "Read integration data",
            "compass.integration.write": "Write integration data",
            "scim.write": "SCIM provisioning access"
          }
        }
      },
      "x-device-authorization-endpoint":
        "https://login.microsoftonline.com/common/oauth2/v2.0/devicecode"
    }
  };

  return document;
}
