import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ApiErrorSchema,
  type ConsolidatedEmployeeViewParams,
  ConsolidatedEmployeeViewParamsSchema,
  ConsolidatedEmployeeViewSchema
} from "@compass/contracts";
import type { ApiConfig } from "../../config/index.js";
import { extractBearerToken, hasRequiredScope, verifyAccessToken } from "../auth/auth.js";
import type { ConsolidatedViewRepository } from "./repository.js";

interface ConsolidatedViewRouteOptions {
  config: ApiConfig;
  repository: ConsolidatedViewRepository;
  now: () => Date;
}

export function registerConsolidatedViewRoute(
  app: FastifyInstance,
  options: ConsolidatedViewRouteOptions
) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get<{ Params: ConsolidatedEmployeeViewParams }>(
    "/api/v1/employees/:employeeId/consolidated-view",
    {
      schema: {
        params: ConsolidatedEmployeeViewParamsSchema,
        response: {
          200: ConsolidatedEmployeeViewSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema
        }
      }
    },
    async (request, reply) => {
      const token = extractBearerToken(request.headers.authorization);
      if (!token) {
        return reply.status(401).send({
          code: "unauthorized",
          message: "Bearer token is required"
        });
      }

      const principal = await verifyAccessToken(token, options.config);
      if (!principal) {
        return reply.status(401).send({
          code: "unauthorized",
          message: "Bearer token is invalid"
        });
      }

      if (!hasRequiredScope(principal, options.config.requiredScope)) {
        return reply.status(403).send({
          code: "forbidden",
          message: `Missing required scope: ${options.config.requiredScope}`
        });
      }

      const requestedEmployeeId = request.params.employeeId;
      const isSameEmployee = principal.subject === requestedEmployeeId;
      const isAdmin = principal.roles.includes("TimeSync.Admin");

      if (!isSameEmployee && !isAdmin) {
        return reply.status(403).send({
          code: "forbidden",
          message: "Access is restricted to the authenticated employee context"
        });
      }

      const view = await options.repository.getByEmployeeId(requestedEmployeeId, options.now());
      if (!view) {
        return reply.status(404).send({
          code: "not_found",
          message: `No consolidated view found for employee '${requestedEmployeeId}'`
        });
      }

      return reply.status(200).send(view);
    }
  );
}
