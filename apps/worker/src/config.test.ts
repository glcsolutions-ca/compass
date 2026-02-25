import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "./config.js";

describe("loadWorkerConfig", () => {
  it("loads defaults", () => {
    const config = loadWorkerConfig({
      AZURE_SERVICE_BUS_CONNECTION_STRING:
        "Endpoint=sb://test/;SharedAccessKeyName=a;SharedAccessKey=b",
      SERVICE_BUS_QUEUE_NAME: "compass-events"
    });

    expect(config).toEqual({
      serviceBusConnectionString: "Endpoint=sb://test/;SharedAccessKeyName=a;SharedAccessKey=b",
      queueName: "compass-events",
      runMode: "loop",
      maxMessages: 10,
      maxWaitSeconds: 15
    });
  });

  it("supports once mode", () => {
    const config = loadWorkerConfig({
      AZURE_SERVICE_BUS_CONNECTION_STRING:
        "Endpoint=sb://test/;SharedAccessKeyName=a;SharedAccessKey=b",
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
        AZURE_SERVICE_BUS_CONNECTION_STRING:
          "Endpoint=sb://test/;SharedAccessKeyName=a;SharedAccessKey=b",
        SERVICE_BUS_QUEUE_NAME: "compass-events",
        WORKER_RUN_MODE: "invalid"
      })
    ).toThrow("WORKER_RUN_MODE must be 'loop' or 'once'");
  });
});
