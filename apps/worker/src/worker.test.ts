import { createEventEnvelopeFixture, createServiceBusMessageFixture } from "@compass/testkit";
import { describe, expect, it, vi } from "vitest";
import type { WorkerConfig } from "./config.js";
import { runWorker } from "./worker.js";

function createConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  return {
    serviceBusConnectionString: "Endpoint=sb://test/;SharedAccessKeyName=a;SharedAccessKey=b",
    queueName: "compass-events",
    runMode: "once",
    maxMessages: 10,
    maxWaitSeconds: 15,
    ...overrides
  };
}

function createRuntime(messages: unknown[] = []) {
  const completeMessage = vi.fn(async () => undefined);
  const abandonMessage = vi.fn(async () => undefined);
  const deadLetterMessage = vi.fn(async () => undefined);
  const receiveMessages = vi.fn(async () => messages as never[]);
  const closeReceiver = vi.fn(async () => undefined);
  const closeClient = vi.fn(async () => undefined);
  let processMessagePromise: Promise<void> = Promise.resolve();

  const receiver = {
    receiveMessages,
    completeMessage,
    abandonMessage,
    deadLetterMessage,
    subscribe: vi.fn((handlers: { processMessage: (message: never) => Promise<void> }) => {
      const [firstMessage] = messages as never[];
      if (!firstMessage) {
        return;
      }
      processMessagePromise = handlers.processMessage(firstMessage);
    }),
    close: closeReceiver
  };

  const client = {
    createReceiver: vi.fn(() => receiver),
    close: closeClient
  };

  const createServiceBusClient = vi.fn(() => client);

  return {
    receiver,
    client,
    createServiceBusClient,
    completeMessage,
    abandonMessage,
    deadLetterMessage,
    receiveMessages,
    awaitProcessMessage: () => processMessagePromise,
    closeReceiver,
    closeClient
  };
}

describe("runWorker", () => {
  it("completes valid messages in once mode", async () => {
    const message = createServiceBusMessageFixture({
      body: createEventEnvelopeFixture()
    });
    const runtime = createRuntime([message]);

    await runWorker(createConfig({ runMode: "once" }), {
      createServiceBusClient: runtime.createServiceBusClient
    });

    expect(runtime.receiveMessages).toHaveBeenCalledOnce();
    expect(runtime.completeMessage).toHaveBeenCalledOnce();
    expect(runtime.abandonMessage).not.toHaveBeenCalled();
    expect(runtime.deadLetterMessage).not.toHaveBeenCalled();
  });

  it("abandons malformed messages for retry in once mode", async () => {
    const message = createServiceBusMessageFixture({
      body: { invalid: true },
      deliveryCount: 2
    });
    const runtime = createRuntime([message]);

    await runWorker(createConfig({ runMode: "once" }), {
      createServiceBusClient: runtime.createServiceBusClient
    });

    expect(runtime.completeMessage).not.toHaveBeenCalled();
    expect(runtime.abandonMessage).toHaveBeenCalledOnce();
    expect(runtime.deadLetterMessage).not.toHaveBeenCalled();
  });

  it("dead-letters malformed messages at max delivery attempts", async () => {
    const message = createServiceBusMessageFixture({
      body: { invalid: true },
      deliveryCount: 5
    });
    const runtime = createRuntime([message]);

    await runWorker(createConfig({ runMode: "once" }), {
      createServiceBusClient: runtime.createServiceBusClient
    });

    expect(runtime.completeMessage).not.toHaveBeenCalled();
    expect(runtime.abandonMessage).not.toHaveBeenCalled();
    expect(runtime.deadLetterMessage).toHaveBeenCalledOnce();
  });

  it("subscribes and settles messages in loop mode", async () => {
    const message = createServiceBusMessageFixture({
      body: createEventEnvelopeFixture()
    });
    const runtime = createRuntime([message]);

    await runWorker(createConfig({ runMode: "loop" }), {
      createServiceBusClient: runtime.createServiceBusClient,
      waitForShutdown: async () => {
        await runtime.awaitProcessMessage();
      }
    });

    expect(runtime.receiver.subscribe).toHaveBeenCalledOnce();
    expect(runtime.completeMessage).toHaveBeenCalledOnce();
    expect(runtime.closeReceiver).toHaveBeenCalledOnce();
    expect(runtime.closeClient).toHaveBeenCalledOnce();
  });
});
