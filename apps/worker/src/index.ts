import "dotenv/config";
import { loadWorkerConfig } from "./config.js";
import { runWorker } from "./worker.js";

const config = loadWorkerConfig();

console.info(`Worker starting in ${config.runMode} mode for queue '${config.queueName}'`);

void runWorker(config).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
