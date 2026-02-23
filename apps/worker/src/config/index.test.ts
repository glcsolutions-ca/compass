import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "./index.js";

describe("loadWorkerConfig", () => {
  it("applies defaults when optional env vars are absent", () => {
    const config = loadWorkerConfig({});

    expect(config).toEqual({
      connectionString: undefined,
      queueName: "compass-events",
      maxAttempts: 5
    });
  });

  it("uses MAX_EVENT_ATTEMPTS when provided", () => {
    const config = loadWorkerConfig({
      MAX_EVENT_ATTEMPTS: "7"
    });

    expect(config.maxAttempts).toBe(7);
  });

  it("fails fast when attempts is invalid", () => {
    expect(() =>
      loadWorkerConfig({
        MAX_EVENT_ATTEMPTS: "0"
      })
    ).toThrow();
  });
});
