import { describe, expect, it } from "vitest";
import { withEnv } from "./env.js";

describe("withEnv", () => {
  it("applies env overrides for the callback and restores after completion", async () => {
    process.env.TESTKIT_EXAMPLE = "before";

    await withEnv({ TESTKIT_EXAMPLE: "during" }, async () => {
      expect(process.env.TESTKIT_EXAMPLE).toBe("during");
    });

    expect(process.env.TESTKIT_EXAMPLE).toBe("before");
    delete process.env.TESTKIT_EXAMPLE;
  });

  it("supports unsetting env keys during execution", async () => {
    process.env.TESTKIT_EXAMPLE = "before";

    await withEnv({ TESTKIT_EXAMPLE: undefined }, async () => {
      expect(process.env.TESTKIT_EXAMPLE).toBeUndefined();
    });

    expect(process.env.TESTKIT_EXAMPLE).toBe("before");
    delete process.env.TESTKIT_EXAMPLE;
  });
});
