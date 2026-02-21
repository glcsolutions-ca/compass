import "dotenv/config";
import { ServiceBusClient } from "@azure/service-bus";
import { loadWorkerConfig } from "./config/index.js";
import {
  InMemoryIdempotencyStore,
  parseSyncMessage,
  processSyncMessage
} from "./features/sync/index.js";

function main(): void {
  const config = loadWorkerConfig();

  if (!config.connectionString) {
    console.info(
      "Worker started in dry mode: set AZURE_SERVICE_BUS_CONNECTION_STRING to process queue messages."
    );
    return;
  }

  const client = new ServiceBusClient(config.connectionString);
  const receiver = client.createReceiver(config.queueName);
  const store = new InMemoryIdempotencyStore();

  receiver.subscribe({
    processError: async (error) => {
      console.error("Service Bus processing error", error);
    },
    processMessage: async (message) => {
      const syncMessage = parseSyncMessage(message);
      if (!syncMessage) {
        await receiver.deadLetterMessage(message, {
          deadLetterReason: "invalid_payload",
          deadLetterErrorDescription: "Message body does not match SyncMessage schema"
        });
        return;
      }

      const result = processSyncMessage(syncMessage, store, { maxAttempts: config.maxAttempts });

      switch (result.status) {
        case "processed":
        case "duplicate": {
          await receiver.completeMessage(message);
          break;
        }
        case "retry": {
          await receiver.abandonMessage(message);
          break;
        }
        case "dead-letter": {
          await receiver.deadLetterMessage(message, {
            deadLetterReason: "max_attempts",
            deadLetterErrorDescription: result.reason
          });
          break;
        }
      }
    }
  });

  console.info(`Worker listening on queue '${config.queueName}'`);
}

try {
  main();
} catch (error) {
  console.error("Worker failed to start", error);
  process.exit(1);
}
