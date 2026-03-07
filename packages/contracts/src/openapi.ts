import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { registerAuthOpenApiPaths } from "./openapi/auth.js";
import { registerOpenApiComponents } from "./openapi/components.js";
import { registerRuntimeOpenApiPaths } from "./openapi/runtime.js";
import { registerSystemOpenApiPaths } from "./openapi/system.js";
import { registerThreadOpenApiPaths } from "./openapi/threads.js";
import { registerWorkspaceOpenApiPaths } from "./openapi/workspaces.js";

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
  registerOpenApiComponents(registry);
  registerSystemOpenApiPaths(registry);
  registerAuthOpenApiPaths(registry);
  registerWorkspaceOpenApiPaths(registry);
  registerRuntimeOpenApiPaths(registry);
  registerThreadOpenApiPaths(registry);

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Compass API",
      version: API_VERSION,
      description: "Compass API baseline with Entra-first organization/workspace auth"
    },
    servers: [{ url: "http://localhost:3001" }],
    tags: [
      { name: "System", description: "Platform system endpoints" },
      { name: "Auth", description: "Authentication and session endpoints" },
      { name: "Workspaces", description: "Workspace membership and invite endpoints" },
      { name: "Threads", description: "Thread and turn orchestration endpoints" },
      { name: "Runtime", description: "Runtime account and stream endpoints" }
    ]
  }) as unknown as Record<string, unknown>;
}
