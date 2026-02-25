import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "./config.js";

describe("loadWorkerConfig", () => {
  it("loads defaults", () => {
    const config = loadWorkerConfig({
      SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE: "sb-compass-prod-cc-4514-01.servicebus.windows.net",
      AZURE_CLIENT_ID: "11111111-2222-3333-4444-555555555555",
      SERVICE_BUS_QUEUE_NAME: "compass-events"
    });

    expect(config).toEqual({
      serviceBusFullyQualifiedNamespace: "sb-compass-prod-cc-4514-01.servicebus.windows.net",
      azureClientId: "11111111-2222-3333-4444-555555555555",
      queueName: "compass-events",
      runMode: "loop",
      maxMessages: 10,
      maxWaitSeconds: 15
    });
  });

  it("supports once mode", () => {
    const config = loadWorkerConfig({
      SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE: "sb-compass-prod-cc-4514-01.servicebus.windows.net",
      AZURE_CLIENT_ID: "11111111-2222-3333-4444-555555555555",
      SERVICE_BUS_QUEUE_NAME: "compass-events",
      WORKER_RUN_MODE: "once",
      WORKER_MAX_MESSAGES: "2",
      WORKER_MAX_WAIT_SECONDS: "3"
    });

    expect(config.runMode).toBe("once");
    expect(config.maxMessages).toBe(2);
    expect(config.maxWaitSeconds).toBe(3);
  });

  it("rejects invalid run mode", () => {
    expect(() =>
      loadWorkerConfig({
        SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE: "sb-compass-prod-cc-4514-01.servicebus.windows.net",
        AZURE_CLIENT_ID: "11111111-2222-3333-4444-555555555555",
        SERVICE_BUS_QUEUE_NAME: "compass-events",
        WORKER_RUN_MODE: "invalid"
      })
    ).toThrow("WORKER_RUN_MODE must be 'loop' or 'once'");
  });

  it("rejects missing namespace", () => {
    expect(() =>
      loadWorkerConfig({
        AZURE_CLIENT_ID: "11111111-2222-3333-4444-555555555555",
        SERVICE_BUS_QUEUE_NAME: "compass-events"
      })
    ).toThrow("SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE is required");
  });

  it("rejects missing client id", () => {
    expect(() =>
      loadWorkerConfig({
        SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE: "sb-compass-prod-cc-4514-01.servicebus.windows.net",
        SERVICE_BUS_QUEUE_NAME: "compass-events"
      })
    ).toThrow("AZURE_CLIENT_ID is required");
  });
});
