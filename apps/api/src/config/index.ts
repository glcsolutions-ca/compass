import { z } from "zod";

const BooleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const CsvStringSchema = z.string().transform((value) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
);

const AuthAssignmentSchema = z.object({
  tenantId: z.string().min(1),
  subjectType: z.enum(["user", "app"]),
  subjectId: z.string().min(1),
  permissions: z.array(z.string().min(1)).default([]),
  principalId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional()
});

const ScimClientSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(8),
  scopes: z.array(z.string().min(1)).default(["scim.write"]),
  roles: z.array(z.string().min(1)).default(["scim.provisioner"])
});

const JsonAuthAssignmentsSchema = z.string().transform((value, ctx) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return z.array(AuthAssignmentSchema).parse(parsed);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        error instanceof Error
          ? `AUTH_ASSIGNMENTS_JSON must be valid JSON (${error.message})`
          : "AUTH_ASSIGNMENTS_JSON must be valid JSON"
    });
    return z.NEVER;
  }
});

const JsonScimClientsSchema = z.string().transform((value, ctx) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return z.array(ScimClientSchema).parse(parsed);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        error instanceof Error
          ? `AUTH_SCIM_CLIENTS_JSON must be valid JSON (${error.message})`
          : "AUTH_SCIM_CLIENTS_JSON must be valid JSON"
    });
    return z.NEVER;
  }
});

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
  dbSslRejectUnauthorized: BooleanStringSchema.default("true"),
  authIssuer: z.string().url().default("https://compass.local/auth"),
  authAudience: z.string().min(1).default("api://compass-api"),
  authJwksUri: z.string().url().optional(),
  authLocalJwtSecret: z.string().min(16).optional(),
  authClockToleranceSeconds: z.number().int().nonnegative().default(60),
  authAllowedClientIds: z.array(z.string().min(1)).default([]),
  authActiveTenantIds: z.array(z.string().min(1)).default([]),
  authAllowJitUsers: z.boolean().default(true),
  authAssignments: z.array(AuthAssignmentSchema).default([]),
  scimClients: z.array(ScimClientSchema).default([]),
  oauthTokenIssuer: z.string().url().default("https://compass.local/oauth"),
  oauthTokenAudience: z.string().min(1).default("compass-scim"),
  oauthTokenSigningSecret: z.string().min(16),
  oauthTokenExpiresInSeconds: z.number().int().positive().default(3600)
});

export type AuthAssignment = z.infer<typeof AuthAssignmentSchema>;
export type ScimClient = z.infer<typeof ScimClientSchema>;
export type ApiConfig = z.infer<typeof ApiConfigSchema>;

function defaultLocalJwtSecret(nodeEnv: "development" | "test" | "production") {
  if (nodeEnv === "production") {
    return undefined;
  }

  return "compass-dev-local-jwt-secret";
}

function defaultOAuthSigningSecret(nodeEnv: "development" | "test" | "production") {
  if (nodeEnv === "production") {
    return undefined;
  }

  return "compass-dev-scim-signing-secret";
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const nodeEnv = z
    .enum(["development", "test", "production"])
    .default("development")
    .parse(env.NODE_ENV);
  const localJwtSecret = env.AUTH_LOCAL_JWT_SECRET ?? defaultLocalJwtSecret(nodeEnv);
  const oauthSigningSecret = env.OAUTH_TOKEN_SIGNING_SECRET ?? defaultOAuthSigningSecret(nodeEnv);

  return ApiConfigSchema.parse({
    nodeEnv,
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
    dbSslRejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
    authIssuer: env.AUTH_ISSUER,
    authAudience: env.AUTH_AUDIENCE,
    authJwksUri: env.AUTH_JWKS_URI,
    authLocalJwtSecret: localJwtSecret,
    authClockToleranceSeconds: env.AUTH_CLOCK_TOLERANCE_SECONDS
      ? Number(env.AUTH_CLOCK_TOLERANCE_SECONDS)
      : undefined,
    authAllowedClientIds: env.AUTH_ALLOWED_CLIENT_IDS
      ? CsvStringSchema.parse(env.AUTH_ALLOWED_CLIENT_IDS)
      : undefined,
    authActiveTenantIds: env.AUTH_ACTIVE_TENANT_IDS
      ? CsvStringSchema.parse(env.AUTH_ACTIVE_TENANT_IDS)
      : undefined,
    authAllowJitUsers: env.AUTH_ALLOW_JIT_USERS
      ? BooleanStringSchema.parse(env.AUTH_ALLOW_JIT_USERS)
      : undefined,
    authAssignments: env.AUTH_ASSIGNMENTS_JSON
      ? JsonAuthAssignmentsSchema.parse(env.AUTH_ASSIGNMENTS_JSON)
      : undefined,
    scimClients: env.AUTH_SCIM_CLIENTS_JSON
      ? JsonScimClientsSchema.parse(env.AUTH_SCIM_CLIENTS_JSON)
      : undefined,
    oauthTokenIssuer: env.OAUTH_TOKEN_ISSUER,
    oauthTokenAudience: env.OAUTH_TOKEN_AUDIENCE,
    oauthTokenSigningSecret: oauthSigningSecret,
    oauthTokenExpiresInSeconds: env.OAUTH_TOKEN_EXPIRES_IN_SECONDS
      ? Number(env.OAUTH_TOKEN_EXPIRES_IN_SECONDS)
      : undefined
  });
}
