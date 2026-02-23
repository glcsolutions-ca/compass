import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { HealthResponseSchema } from "./schemas.js";

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

  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Compass API",
      version: API_VERSION,
      description: "Foundation API with system endpoints only"
    },
    servers: [{ url: "http://localhost:3001" }],
    tags: [{ name: "System", description: "Platform system endpoints" }]
  }) as unknown as Record<string, unknown>;
}
