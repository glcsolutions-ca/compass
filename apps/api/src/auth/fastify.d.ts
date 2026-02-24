import type { AuthenticatedRequestContext, ScimTokenContext } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthenticatedRequestContext;
    scimAuth?: ScimTokenContext;
  }
}
