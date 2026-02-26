export type AuthMode = "mock" | "entra";

export interface ApiConfig {
  host: string;
  port: number;
  logLevel: string;
  databaseUrl?: string;
  authMode: AuthMode;
}

const DEFAULT_API_HOST = "0.0.0.0";
const DEFAULT_API_PORT = 3001;
const DEFAULT_LOG_LEVEL = "info";
const DEFAULT_AUTH_MODE: AuthMode = "mock";

function parseApiPort(rawPort: string | undefined): number {
  const portCandidate = rawPort?.trim();
  if (!portCandidate) {
    return DEFAULT_API_PORT;
  }

  if (!/^\d+$/.test(portCandidate)) {
    throw new Error(`Invalid API_PORT: ${portCandidate}`);
  }

  const port = Number.parseInt(portCandidate, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`Invalid API_PORT: ${portCandidate}`);
  }

  return port;
}

function parseAuthMode(rawAuthMode: string | undefined): AuthMode {
  const normalized = rawAuthMode?.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_AUTH_MODE;
  }

  if (normalized === "mock" || normalized === "entra") {
    return normalized;
  }

  throw new Error(`Invalid AUTH_MODE: ${rawAuthMode}`);
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const host = env.API_HOST?.trim() || DEFAULT_API_HOST;
  const port = parseApiPort(env.API_PORT);
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;

  return {
    host,
    port,
    logLevel: env.LOG_LEVEL?.trim().toLowerCase() || DEFAULT_LOG_LEVEL,
    databaseUrl,
    authMode: parseAuthMode(env.AUTH_MODE)
  };
}
