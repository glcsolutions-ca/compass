import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  ApiErrorSchema,
  ConsolidatedEmployeeViewParamsSchema,
  ConsolidatedEmployeeViewSchema,
  SourceSystemSnapshotSchema,
  TimeEntrySchema,
  WorkPackageSchema
} from "./schemas.js";

export const API_VERSION = "v1";

export function buildOpenApiDocument(): Record<string, unknown> {
  extendZodWithOpenApi(z);
  const registry = new OpenAPIRegistry();

  registry.register("SourceSystemSnapshot", SourceSystemSnapshotSchema);
  registry.register("TimeEntry", TimeEntrySchema);
  registry.register("WorkPackage", WorkPackageSchema);
  registry.register("ConsolidatedEmployeeView", ConsolidatedEmployeeViewSchema);
  registry.register("ApiError", ApiErrorSchema);
  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT"
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/employees/{employeeId}/consolidated-view",
    operationId: "getEmployeeConsolidatedView",
    summary: "Get consolidated time entries and work packages for an employee",
    tags: ["Consolidated View"],
    security: [{ bearerAuth: [] }],
    request: {
      params: ConsolidatedEmployeeViewParamsSchema
    },
    responses: {
      200: {
        description: "Consolidated employee view",
        content: {
          "application/json": {
            schema: ConsolidatedEmployeeViewSchema
          }
        }
      },
      401: {
        description: "Missing or invalid access token",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      403: {
        description: "Authenticated but not authorized for this employee",
        content: {
          "application/json": {
            schema: ApiErrorSchema
          }
        }
      },
      404: {
        description: "Employee record not found in the consolidated view",
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
      title: "Compass Hub API",
      version: API_VERSION,
      description: "Read-only consolidated employee time and work-package API"
    },
    servers: [{ url: "http://localhost:3001" }],
    tags: [{ name: "Consolidated View", description: "Employee-centered consolidated read API" }]
  }) as unknown as Record<string, unknown>;
}
