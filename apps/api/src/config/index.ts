import { z } from "zod";

const BooleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const ApiConfigSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    port: z.number().int().positive().default(3001),
    host: z.string().min(1).default("0.0.0.0"),
    databaseUrl: z.string().min(1).optional(),
    dbPoolMax: z.number().int().positive().default(10),
    dbIdleTimeoutMs: z.number().int().nonnegative().default(10_000),
    dbConnectionTimeoutMs: z.number().int().nonnegative().default(2_000),
    dbSslMode: z.enum(["disable", "require"]).default("disable"),
    dbSslRejectUnauthorized: BooleanStringSchema.default("true"),
    authMode: z.enum(["development", "entra"]).default("development"),
    requiredScope: z.string().min(1).default("time.read"),
    devJwtSecret: z.string().min(8).default("dev-secret-change-me"),
    entraIssuer: z.string().optional(),
    entraAudience: z.string().optional(),
    entraJwksUri: z.string().url().optional()
  })
  .superRefine((value, context) => {
    if (value.nodeEnv === "production" && value.authMode !== "entra") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTH_MODE must be entra when NODE_ENV=production"
      });
    }

    if (value.authMode === "entra") {
      if (!value.entraIssuer) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ENTRA_ISSUER is required when AUTH_MODE=entra"
        });
      }

      if (!value.entraAudience) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ENTRA_AUDIENCE is required when AUTH_MODE=entra"
        });
      }

      if (!value.entraJwksUri) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ENTRA_JWKS_URI is required when AUTH_MODE=entra"
        });
      }
    }
  });

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.API_PORT ? Number(env.API_PORT) : undefined,
    host: env.API_HOST,
    databaseUrl: env.DATABASE_URL,
    dbPoolMax: env.DB_POOL_MAX ? Number(env.DB_POOL_MAX) : undefined,
    dbIdleTimeoutMs: env.DB_IDLE_TIMEOUT_MS ? Number(env.DB_IDLE_TIMEOUT_MS) : undefined,
    dbConnectionTimeoutMs: env.DB_CONNECTION_TIMEOUT_MS
      ? Number(env.DB_CONNECTION_TIMEOUT_MS)
      : undefined,
    dbSslMode: env.DB_SSL_MODE,
    dbSslRejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
    authMode: env.AUTH_MODE,
    requiredScope: env.REQUIRED_SCOPE,
    devJwtSecret: env.DEV_JWT_SECRET,
    entraIssuer: env.ENTRA_ISSUER,
    entraAudience: env.ENTRA_AUDIENCE,
    entraJwksUri: env.ENTRA_JWKS_URI
  });
}
