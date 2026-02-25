import path from "node:path";
import { z } from "zod";

const BooleanStringSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const CodexAppConfigSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  host: z.string().min(1).default("0.0.0.0"),
  port: z.number().int().positive().default(3010),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  databaseUrl: z.string().min(1).optional(),
  codexBinPath: z.string().min(1).default("codex"),
  codexHome: z.string().min(1).default(".codex-gateway"),
  serviceApiKey: z.string().min(1).optional(),
  clientName: z.string().min(1).default("compass_codex_gateway"),
  clientVersion: z.string().min(1).default("0.1.0"),
  startOnBoot: BooleanStringSchema.default("true"),
  entraClientId: z.string().min(1).optional(),
  entraClientSecret: z.string().min(1).optional(),
  entraRedirectUri: z.string().min(1).optional(),
  entraAllowedTenantIds: z.array(z.string().min(1)).default([]),
  entraLoginEnabled: BooleanStringSchema.default("false"),
  authDevFallbackEnabled: BooleanStringSchema.default("false")
});

export type CodexAppConfig = z.infer<typeof CodexAppConfigSchema>;

export function loadCodexAppConfig(env: NodeJS.ProcessEnv = process.env): CodexAppConfig {
  const entraAllowedTenantIds = env.ENTRA_ALLOWED_TENANT_IDS
    ? env.ENTRA_ALLOWED_TENANT_IDS.split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : undefined;

  const parsed = CodexAppConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    host: env.CODEX_HOST,
    port: env.CODEX_PORT ? Number(env.CODEX_PORT) : undefined,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    codexBinPath: env.CODEX_BIN_PATH,
    codexHome: env.CODEX_HOME,
    serviceApiKey: env.OPENAI_API_KEY,
    clientName: env.CODEX_CLIENT_NAME,
    clientVersion: env.CODEX_CLIENT_VERSION,
    startOnBoot: env.CODEX_START_ON_BOOT,
    entraClientId: env.ENTRA_CLIENT_ID,
    entraClientSecret: env.ENTRA_CLIENT_SECRET,
    entraRedirectUri: env.ENTRA_REDIRECT_URI,
    entraAllowedTenantIds,
    entraLoginEnabled: env.ENTRA_LOGIN_ENABLED,
    authDevFallbackEnabled: env.AUTH_DEV_FALLBACK_ENABLED
  });

  return {
    ...parsed,
    codexHome: path.resolve(parsed.codexHome)
  };
}
