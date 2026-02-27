import "dotenv/config";
import { createServer } from "node:http";
import { buildApiApp } from "./app.js";
import { buildDefaultAuthService } from "./auth-service.js";
import { buildDefaultAgentService } from "./agent-service.js";
import { attachAgentWebSocketGateway } from "./agent-websocket.js";
import { loadApiConfig } from "./config.js";

const config = loadApiConfig();
process.env.AUTH_MODE = config.authMode;
const defaultAuth = buildDefaultAuthService(config.databaseUrl, process.env);
const defaultAgent = buildDefaultAgentService({
  databaseUrl: config.databaseUrl,
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
