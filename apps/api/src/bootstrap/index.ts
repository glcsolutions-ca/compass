import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { buildDefaultAuthService } from "../modules/auth/auth-service.js";
import { buildDefaultSessionControlPlane } from "../modules/runtime/session-control-plane.js";
import { buildDefaultThreadService } from "../modules/threads/thread-service.js";
import { buildApiApp } from "../http/build-app.js";
import { attachThreadWebSocketGateway } from "../http/thread-websocket.js";
import { attachSessionAgentGateway } from "../modules/runtime/gateway.js";
import { loadApiConfig } from "./config.js";
import { requireDatabaseUrl, verifyDatabaseReadiness } from "./startup-env.js";

function loadApiServiceEnvFiles(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env.NODE_ENV?.trim().toLowerCase() === "production") {
    return;
  }

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
const sessionControlPlane = buildDefaultSessionControlPlane({
  env: process.env,
  apiPort: config.port,
  now: () => new Date()
});
const defaultThreadService = buildDefaultThreadService({
  databaseUrl,
  env: process.env,
  sessionControlPlane
});
const app = buildApiApp({
  authService: defaultAuth.service,
  threadService: defaultThreadService.service
});

const server = createServer(app);
attachThreadWebSocketGateway({
  server,
  authService: defaultAuth.service,
  threadService: defaultThreadService.service,
  now: () => new Date()
});
attachSessionAgentGateway({
  server,
  controlPlane: sessionControlPlane,
  now: () => new Date()
});

server.listen(config.port, config.host, () => {
  console.info(`API listening on ${config.host}:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      sessionControlPlane.close();
      void Promise.all([defaultAuth.close(), defaultThreadService.close()]).finally(() => {
        process.exit(0);
      });
    });
  });
}
