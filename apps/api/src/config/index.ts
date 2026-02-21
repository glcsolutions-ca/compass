import { z } from "zod";

const ApiConfigSchema = z
  .object({
    port: z.number().int().positive().default(3001),
    host: z.string().min(1).default("0.0.0.0"),
    authMode: z.enum(["development", "entra"]).default("development"),
    requiredScope: z.string().min(1).default("time.read"),
    devJwtSecret: z.string().min(8).default("dev-secret-change-me"),
    entraIssuer: z.string().optional(),
    entraAudience: z.string().optional(),
    entraJwksUri: z.string().url().optional()
  })
  .superRefine((value, context) => {
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
    port: env.API_PORT ? Number(env.API_PORT) : undefined,
    host: env.API_HOST,
    authMode: env.AUTH_MODE,
    requiredScope: env.REQUIRED_SCOPE,
    devJwtSecret: env.DEV_JWT_SECRET,
    entraIssuer: env.ENTRA_ISSUER,
    entraAudience: env.ENTRA_AUDIENCE,
    entraJwksUri: env.ENTRA_JWKS_URI
  });
}
