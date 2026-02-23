import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { HealthResponseSchema } from "@compass/contracts";

export function registerHealthRoute(app: FastifyInstance, now: () => Date) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/health",
    {
      schema: {
        response: {
          200: HealthResponseSchema
        }
      }
    },
    async () => ({
      status: "ok" as const,
      timestamp: now().toISOString()
    })
  );
}
