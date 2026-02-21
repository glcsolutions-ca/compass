import type { FastifyInstance } from "fastify";
import { buildOpenApiDocument } from "@compass/contracts";

export function registerOpenApiRoute(app: FastifyInstance) {
  app.get("/openapi.json", async () => buildOpenApiDocument());
}
