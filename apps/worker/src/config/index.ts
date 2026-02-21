import { z } from "zod";

export const WorkerConfigSchema = z.object({
  connectionString: z.string().min(1).optional(),
  queueName: z.string().min(1).default("compass-updates"),
  maxAttempts: z.coerce.number().int().positive().default(5)
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return WorkerConfigSchema.parse({
    connectionString: env.AZURE_SERVICE_BUS_CONNECTION_STRING,
    queueName: env.SERVICE_BUS_QUEUE_NAME,
    maxAttempts: env.MAX_SYNC_ATTEMPTS
  });
}
