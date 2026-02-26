export interface ApiConfig {
  host: string;
  port: number;
  logLevel: string;
  databaseUrl?: string;
}

const DEFAULT_API_HOST = "0.0.0.0";
const DEFAULT_API_PORT = 3001;
const DEFAULT_LOG_LEVEL = "info";

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

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const host = env.API_HOST?.trim() || DEFAULT_API_HOST;
  const port = parseApiPort(env.API_PORT);
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;

  return {
    host,
    port,
    logLevel: env.LOG_LEVEL?.trim().toLowerCase() || DEFAULT_LOG_LEVEL,
    databaseUrl
  };
}
