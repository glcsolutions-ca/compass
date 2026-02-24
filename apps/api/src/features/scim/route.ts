import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ForbiddenErrorSchema,
  ScimGroupSchema,
  ScimOkResponseSchema,
  ScimUserSchema,
  UnauthorizedErrorSchema
} from "@compass/contracts";
import { z } from "zod";
import type { AuthorizationStore } from "../../auth/store.js";
import { getScimAuth } from "../../auth/middleware.js";

const ScimPathParamsSchema = z.object({
  id: z.string().min(1)
});

interface RegisterScimRouteOptions {
  authorizationStore: AuthorizationStore;
  requireScimAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
}

function wrapAsyncPreHandler(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>
) {
  return (request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void) => {
    void handler(request, reply).then(
      () => done(),
      (error) => done(error instanceof Error ? error : new Error(String(error)))
    );
  };
}

export function registerScimRoutes(app: FastifyInstance, options: RegisterScimRouteOptions) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    "/scim/v2/Users",
    {
      preHandler: wrapAsyncPreHandler(options.requireScimAuth),
      schema: {
        body: ScimUserSchema,
        response: {
          200: ScimOkResponseSchema,
          401: UnauthorizedErrorSchema,
          403: ForbiddenErrorSchema
        }
      }
    },
    async (request) => {
      const scimAuth = getScimAuth(request);
      const body = ScimUserSchema.parse(request.body);
      return options.authorizationStore.upsertScimUser(scimAuth.tenantId, body);
    }
  );

  typedApp.put(
    "/scim/v2/Users/:id",
    {
      preHandler: wrapAsyncPreHandler(options.requireScimAuth),
      schema: {
        params: ScimPathParamsSchema,
        body: ScimUserSchema,
        response: {
          200: ScimOkResponseSchema,
          401: UnauthorizedErrorSchema,
          403: ForbiddenErrorSchema
        }
      }
    },
    async (request) => {
      const scimAuth = getScimAuth(request);
      const body = ScimUserSchema.parse(request.body);
      return options.authorizationStore.upsertScimUser(scimAuth.tenantId, {
        ...body,
        externalId: body.externalId || request.params.id
      });
    }
  );

  typedApp.post(
    "/scim/v2/Groups",
    {
      preHandler: wrapAsyncPreHandler(options.requireScimAuth),
      schema: {
        body: ScimGroupSchema,
        response: {
          200: ScimOkResponseSchema,
          401: UnauthorizedErrorSchema,
          403: ForbiddenErrorSchema
        }
      }
    },
    async (request) => {
      const scimAuth = getScimAuth(request);
      const body = ScimGroupSchema.parse(request.body);
      return options.authorizationStore.upsertScimGroup(scimAuth.tenantId, body);
    }
  );

  typedApp.put(
    "/scim/v2/Groups/:id",
    {
      preHandler: wrapAsyncPreHandler(options.requireScimAuth),
      schema: {
        params: ScimPathParamsSchema,
        body: ScimGroupSchema,
        response: {
          200: ScimOkResponseSchema,
          401: UnauthorizedErrorSchema,
          403: ForbiddenErrorSchema
        }
      }
    },
    async (request) => {
      const scimAuth = getScimAuth(request);
      const body = ScimGroupSchema.parse(request.body);
      return options.authorizationStore.upsertScimGroup(scimAuth.tenantId, {
        ...body,
        externalId: body.externalId || request.params.id
      });
    }
  );
}
