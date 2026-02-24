import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import {
  MePermissionsResponseSchema,
  MeResponseSchema,
  UnauthorizedErrorSchema,
  ForbiddenErrorSchema
} from "@compass/contracts";
import { getRequestAuth } from "../../auth/middleware.js";

interface RegisterMeRoutesOptions {
  requireMeAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
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

export function registerMeRoutes(app: FastifyInstance, options: RegisterMeRoutesOptions) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/v1/me",
    {
      preHandler: wrapAsyncPreHandler(options.requireMeAuth),
      schema: {
        response: {
          200: MeResponseSchema,
          401: UnauthorizedErrorSchema,
          403: ForbiddenErrorSchema
        }
      }
    },
    async (request) => {
      const auth = getRequestAuth(request);
      return {
        caller: {
          tenantId: auth.tenantId,
          tokenType: auth.tokenType,
          subjectType: auth.subjectType,
          subjectId: auth.subjectId,
          actorClientId: auth.actorClientId
        }
      };
    }
  );

  typedApp.get(
    "/v1/me/permissions",
    {
      preHandler: wrapAsyncPreHandler(options.requireMeAuth),
      schema: {
        response: {
          200: MePermissionsResponseSchema,
          401: UnauthorizedErrorSchema,
          403: ForbiddenErrorSchema
        }
      }
    },
    async (request) => {
      const auth = getRequestAuth(request);
      return {
        caller: {
          tenantId: auth.tenantId,
          tokenType: auth.tokenType,
          subjectType: auth.subjectType,
          subjectId: auth.subjectId,
          actorClientId: auth.actorClientId
        },
        permissions: [...auth.permissions].sort()
      };
    }
  );
}
