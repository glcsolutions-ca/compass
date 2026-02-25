export interface ApiConfig {
  host: string;
  port: number;
  logLevel: string;
}

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const host = env.API_HOST?.trim() || "0.0.0.0";
  const port = Number(env.API_PORT ?? "3001");

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid API_PORT: ${env.API_PORT}`);
  }

  return {
    host,
    port,
    logLevel: env.LOG_LEVEL?.trim() || "info"
  };
}
