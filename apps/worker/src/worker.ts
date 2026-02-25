import {
  ServiceBusClient,
  type DeadLetterOptions,
  type MessageHandlers,
  type ServiceBusReceivedMessage
} from "@azure/service-bus";
import { DefaultAzureCredential } from "@azure/identity";
import { EventEnvelopeSchema } from "@compass/contracts";
import type { WorkerConfig } from "./config.js";
import { classifySettlement } from "./classify.js";

export interface WorkerDependencies {
  log?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  createServiceBusClient?: (
    fullyQualifiedNamespace: string,
    credential: unknown
  ) => ServiceBusClientLike;
  createCredential?: (managedIdentityClientId: string) => unknown;
  waitForShutdown?: () => Promise<void>;
}

type DeadLetterMessageOptions = DeadLetterOptions & {
  [key: string]: string | number | boolean | Date | null;
};

interface ServiceBusReceiverLike {
  receiveMessages(
    maxMessages: number,
    options?: {
      maxWaitTimeInMs?: number;
    }
  ): Promise<ServiceBusReceivedMessage[]>;
  completeMessage(message: ServiceBusReceivedMessage): Promise<void>;
  abandonMessage(message: ServiceBusReceivedMessage): Promise<void>;
  deadLetterMessage(
    message: ServiceBusReceivedMessage,
    options: DeadLetterMessageOptions
  ): Promise<void>;
  subscribe(handlers: MessageHandlers): void;
  close(): Promise<void>;
}

interface ServiceBusClientLike {
  createReceiver(queueName: string): ServiceBusReceiverLike;
  close(): Promise<void>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function handleMessage(
  message: ServiceBusReceivedMessage,
  complete: (message: ServiceBusReceivedMessage) => Promise<void>,
  abandon: (message: ServiceBusReceivedMessage) => Promise<void>,
  deadLetter: (
    message: ServiceBusReceivedMessage,
    options: DeadLetterMessageOptions
  ) => Promise<void>,
  log: WorkerDependencies["log"]
) {
  try {
    EventEnvelopeSchema.parse(message.body);

    // Skeleton: processing will be implemented in follow-up phases.
    await complete(message);
  } catch (error) {
    const action = classifySettlement(message, error);

    if (action === "dead-letter") {
      await deadLetter(message, {
        deadLetterReason: "max-delivery-attempts-reached",
        deadLetterErrorDescription: getErrorMessage(error)
      });
      log?.warn?.("Dead-lettered message", {
        messageId: message.messageId,
        deliveryCount: message.deliveryCount,
        error: getErrorMessage(error)
      });
      return;
    }

    await abandon(message);
    log?.warn?.("Abandoned message for retry", {
      messageId: message.messageId,
      deliveryCount: message.deliveryCount,
      error: getErrorMessage(error)
    });
  }
}

export async function runWorker(config: WorkerConfig, deps: WorkerDependencies = {}) {
  const log = deps.log ?? console;
  const createServiceBusClient =
    deps.createServiceBusClient ??
    ((fullyQualifiedNamespace: string, credential: unknown) =>
      new ServiceBusClient(fullyQualifiedNamespace, credential as never) as ServiceBusClientLike);
  const createCredential =
    deps.createCredential ??
    ((managedIdentityClientId: string) => new DefaultAzureCredential({ managedIdentityClientId }));
  const waitForShutdown = deps.waitForShutdown ?? (() => new Promise<void>(() => {}));

  const credential = createCredential(config.azureClientId);
  const client = createServiceBusClient(config.serviceBusFullyQualifiedNamespace, credential);
  const receiver = client.createReceiver(config.queueName);

  try {
    if (config.runMode === "once") {
      const messages = await receiver.receiveMessages(config.maxMessages, {
        maxWaitTimeInMs: config.maxWaitSeconds * 1000
      });

      for (const message of messages) {
        await handleMessage(
          message,
          (candidate) => receiver.completeMessage(candidate),
          (candidate) => receiver.abandonMessage(candidate),
          (candidate, options) => receiver.deadLetterMessage(candidate, options),
          log
        );
      }

      return;
    }

    const handlers: MessageHandlers = {
      processMessage: async (message) => {
        await handleMessage(
          message,
          (candidate) => receiver.completeMessage(candidate),
          (candidate) => receiver.abandonMessage(candidate),
          (candidate, options) => receiver.deadLetterMessage(candidate, options),
          log
        );
      },
      processError: async (args) => {
        log.error("Worker receive loop error", args.error);
      }
    };

    receiver.subscribe(handlers);

    // Keep the worker process alive when in loop mode.
    await waitForShutdown();
  } finally {
    await receiver.close();
    await client.close();
  }
}
