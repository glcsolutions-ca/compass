import "dotenv/config";
import { buildApiApp } from "./app.js";
import { buildDefaultAuthService } from "./auth-service.js";
import { loadApiConfig } from "./config.js";

const config = loadApiConfig();
const defaultAuth = buildDefaultAuthService(config.databaseUrl, process.env);
const app = buildApiApp({
  authService: defaultAuth.service
});

app.listen(config.port, config.host, () => {
  console.info(`API listening on ${config.host}:${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void defaultAuth.close().finally(() => {
      process.exit(0);
    });
  });
}
