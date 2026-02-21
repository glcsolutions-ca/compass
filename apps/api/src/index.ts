import "dotenv/config";
import { buildApiApp } from "./app.js";
import { loadApiConfig } from "./config/index.js";

const config = loadApiConfig();
const app = buildApiApp({ config });

app
  .listen({
    host: config.host,
    port: config.port
  })
  .then(() => {
    app.log.info(`API listening on ${config.host}:${config.port}`);
  })
  .catch((error) => {
    app.log.error(error, "API failed to start");
    process.exit(1);
  });
