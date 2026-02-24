import "dotenv/config";
import { buildCodexGatewayApp } from "./app.js";
import { loadCodexAppConfig } from "./config/index.js";

const config = loadCodexAppConfig();
const app = buildCodexGatewayApp({ config });

app
  .listen({
    host: config.host,
    port: config.port
  })
  .then(() => {
    app.log.info(
      `Codex gateway listening on ${config.host}:${config.port} (startOnBoot=${config.startOnBoot}, codexHome=${config.codexHome}, client=${config.clientName}/${config.clientVersion}, pid=${process.pid})`
    );
  })
  .catch((error) => {
    app.log.error(error, "Codex gateway failed to start");
    process.exit(1);
  });
