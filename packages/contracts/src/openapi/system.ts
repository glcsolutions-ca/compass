import { type OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { HealthResponseSchema, PingResponseSchema } from "../schemas.js";

export function registerSystemOpenApiPaths(registry: OpenAPIRegistry): void {
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
}
