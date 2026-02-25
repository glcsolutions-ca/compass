import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { HealthResponseSchema, PingResponseSchema } from "./schemas.js";

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

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Compass API",
      version: API_VERSION,
      description: "Compass API baseline (React Router + Express + worker)"
    },
    servers: [{ url: "http://localhost:3001" }],
    tags: [{ name: "System", description: "Platform system endpoints" }]
  }) as unknown as Record<string, unknown>;
}
