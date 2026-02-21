import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "./index.js";

describe("loadWorkerConfig", () => {
  it("applies defaults when optional env vars are absent", () => {
    const config = loadWorkerConfig({});

    expect(config).toEqual({
      connectionString: undefined,
      queueName: "compass-updates",
      maxAttempts: 5
    });
  });

  it("coerces MAX_SYNC_ATTEMPTS to a number", () => {
    const config = loadWorkerConfig({
      MAX_SYNC_ATTEMPTS: "7"
    });

    expect(config.maxAttempts).toBe(7);
  });

  it("fails fast when MAX_SYNC_ATTEMPTS is invalid", () => {
    expect(() =>
      loadWorkerConfig({
        MAX_SYNC_ATTEMPTS: "0"
      })
    ).toThrow();
  });
});
