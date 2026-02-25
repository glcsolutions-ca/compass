const DEFAULT_SESSION_SECRET = "compass-web-session-dev-secret";

function readString(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  return value && value.length > 0 ? value : null;
}

function readFlag(env: NodeJS.ProcessEnv, key: string) {
  return env[key]?.trim().toLowerCase() === "true";
}

function readCsv(env: NodeJS.ProcessEnv, key: string) {
  const raw = readString(env, key);
  if (!raw) {
    return [] as string[];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export interface WebAuthRuntimeConfig {
  sessionSecret: string | null;
  entraLoginEnabled: boolean;
  devFallbackEnabled: boolean;
  entraClientId: string | null;
  entraClientSecret: string | null;
  entraRedirectUri: string | null;
  entraAllowedTenantIds: string[];
}

export function resolveSessionSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = readString(env, "WEB_SESSION_SECRET");
  if (configured && configured.length >= 16) {
    return configured;
  }

  if (env.NODE_ENV === "production") {
    return null;
  }

  return DEFAULT_SESSION_SECRET;
}

export function isAuthDevFallbackEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" && readFlag(env, "AUTH_DEV_FALLBACK_ENABLED");
}

export function loadWebAuthRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): WebAuthRuntimeConfig {
  return {
    sessionSecret: resolveSessionSecret(env),
    entraLoginEnabled: readFlag(env, "ENTRA_LOGIN_ENABLED"),
    devFallbackEnabled: isAuthDevFallbackEnabled(env),
    entraClientId: readString(env, "ENTRA_CLIENT_ID"),
    entraClientSecret: readString(env, "ENTRA_CLIENT_SECRET"),
    entraRedirectUri: readString(env, "ENTRA_REDIRECT_URI"),
    entraAllowedTenantIds: readCsv(env, "ENTRA_ALLOWED_TENANT_IDS")
  };
}
