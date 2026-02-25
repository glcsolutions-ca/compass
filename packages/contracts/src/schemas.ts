import { z } from "zod";

export const HealthStatusSchema = z.literal("ok");

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  timestamp: z.string().datetime()
});

export const PingResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("api")
});

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type PingResponse = z.infer<typeof PingResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
