import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import {
  CreateRoleRequestSchema,
  ForbiddenErrorSchema,
  RoleSchema,
  RolesResponseSchema,
  UnauthorizedErrorSchema
} from "@compass/contracts";
import { z } from "zod";
import type { AuthorizationStore } from "../../auth/store.js";

const TenantIdParamsSchema = z.object({
  tenantId: z.string().min(1)
});

interface RegisterRoleRoutesOptions {
  authorizationStore: AuthorizationStore;
  requireRolesReadAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  requireRolesWriteAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
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

export function registerRoleRoutes(app: FastifyInstance, options: RegisterRoleRoutesOptions) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/v1/tenants/:tenantId/roles",
    {
      preHandler: wrapAsyncPreHandler(options.requireRolesReadAuth),
      schema: {
        params: TenantIdParamsSchema,
        response: {
          200: RolesResponseSchema,
          401: UnauthorizedErrorSchema,
          403: ForbiddenErrorSchema
        }
      }
    },
    async (request) => {
      const roles = await options.authorizationStore.listRoles(request.params.tenantId);
      return { items: roles };
    }
  );

  typedApp.post(
    "/v1/tenants/:tenantId/roles",
    {
      preHandler: wrapAsyncPreHandler(options.requireRolesWriteAuth),
      schema: {
        params: TenantIdParamsSchema,
        body: CreateRoleRequestSchema,
        response: {
          201: RoleSchema,
          401: UnauthorizedErrorSchema,
          403: ForbiddenErrorSchema
        }
      }
    },
    async (request, reply) => {
      const body = CreateRoleRequestSchema.parse(request.body);
      const created = await options.authorizationStore.createRole(request.params.tenantId, body);
      return reply.status(201).send(created);
    }
  );
}
