import type { FastifyInstance } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const HealthSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime()
});

export function registerHealthRoute(app: FastifyInstance, now: () => Date) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    "/health",
    {
      schema: {
        response: {
          200: HealthSchema
        }
      }
    },
    async () => ({
      status: "ok" as const,
      timestamp: now().toISOString()
    })
  );
}
