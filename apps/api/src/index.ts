import "dotenv/config";
import { buildApiApp } from "./app.js";
import { loadApiConfig } from "./config.js";

const config = loadApiConfig();
const app = buildApiApp();

app.listen(config.port, config.host, () => {
  console.info(`API listening on ${config.host}:${config.port}`);
});
