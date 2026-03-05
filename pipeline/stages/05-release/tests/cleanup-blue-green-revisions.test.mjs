import { describe, expect, it } from "vitest";
import { determineRevisionsToDeactivate } from "../../../shared/scripts/azure/blue-green-utils.mjs";

describe("cleanup-blue-green-revisions", () => {
  it("deactivates active revisions outside the blue/green pair", () => {
    expect(
      determineRevisionsToDeactivate({
        activeRevisionNames: ["api-blue", "api-green", "api-old-1", "api-old-2"],
        keepRevisionNames: ["api-blue", "api-green"]
      })
    ).toEqual(["api-old-1", "api-old-2"]);
  });

  it("is a no-op when only blue and green are active", () => {
    expect(
      determineRevisionsToDeactivate({
        activeRevisionNames: ["web-blue", "web-green"],
        keepRevisionNames: ["web-blue", "web-green"]
      })
    ).toEqual([]);
  });
});
