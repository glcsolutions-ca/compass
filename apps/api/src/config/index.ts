import { z } from "zod";

const BooleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const ApiConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  port: z.number().int().positive().default(3001),
  host: z.string().min(1).default("0.0.0.0"),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  databaseUrl: z.string().min(1).optional(),
  dbPoolMax: z.number().int().positive().default(10),
  dbIdleTimeoutMs: z.number().int().nonnegative().default(10_000),
  dbConnectionTimeoutMs: z.number().int().nonnegative().default(2_000),
  dbSslMode: z.enum(["disable", "require"]).default("disable"),
  dbSslRejectUnauthorized: BooleanStringSchema.default("true")
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.API_PORT ? Number(env.API_PORT) : undefined,
    host: env.API_HOST,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    dbPoolMax: env.DB_POOL_MAX ? Number(env.DB_POOL_MAX) : undefined,
    dbIdleTimeoutMs: env.DB_IDLE_TIMEOUT_MS ? Number(env.DB_IDLE_TIMEOUT_MS) : undefined,
    dbConnectionTimeoutMs: env.DB_CONNECTION_TIMEOUT_MS
      ? Number(env.DB_CONNECTION_TIMEOUT_MS)
      : undefined,
    dbSslMode: env.DB_SSL_MODE,
    dbSslRejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED
  });
}
