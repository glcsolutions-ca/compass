import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { buildApiApp } from "./app.js";
import { buildDefaultAuthService } from "./auth-service.js";
import { buildDefaultAgentService } from "./agent-service.js";
import { attachAgentWebSocketGateway } from "./agent-websocket.js";
import { loadApiConfig } from "./config.js";
import { requireDatabaseUrl, verifyDatabaseReadiness } from "./startup-env.js";

function loadApiServiceEnvFiles(cwd: string = process.cwd()): void {
  const candidateServiceDirs = [path.resolve(cwd), path.resolve(cwd, "apps/api")];
  const seen = new Set<string>();

  for (const serviceDir of candidateServiceDirs) {
    const normalized = path.resolve(serviceDir);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    const envLocalPath = path.resolve(normalized, ".env.local");
    if (existsSync(envLocalPath)) {
      loadEnvFile(envLocalPath);
    }

    const envPath = path.resolve(normalized, ".env");
    if (existsSync(envPath)) {
      loadEnvFile(envPath);
    }
  }
}

loadApiServiceEnvFiles();

const config = loadApiConfig();
const databaseUrl = requireDatabaseUrl(config.databaseUrl);
process.env.DATABASE_URL = databaseUrl;
process.env.AUTH_MODE = config.authMode;
await verifyDatabaseReadiness({ databaseUrl });

const defaultAuth = buildDefaultAuthService(databaseUrl, process.env);
const defaultAgent = buildDefaultAgentService({
  databaseUrl,
  env: process.env
});
const app = buildApiApp({
  authService: defaultAuth.service,
  agentService: defaultAgent.service
});

const server = createServer(app);
attachAgentWebSocketGateway({
  server,
  authService: defaultAuth.service,
  agentService: defaultAgent.service,
  now: () => new Date()
});

server.listen(config.port, config.host, () => {
  console.info(`API listening on ${config.host}:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void Promise.all([defaultAuth.close(), defaultAgent.close()]).finally(() => {
        process.exit(0);
      });
    });
  });
}
