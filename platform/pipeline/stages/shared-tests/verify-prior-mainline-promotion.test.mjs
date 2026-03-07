import { describe, expect, it } from "vitest";
import {
  findPromotionCheckState,
  parsePreviousMainlineCommit
} from "../../shared/scripts/verify-prior-mainline-promotion.mjs";

describe("verify-prior-mainline-promotion", () => {
  it("passes when the required mainline promotion check succeeded", () => {
    const state = findPromotionCheckState(
      [
        {
          id: 2,
          name: "Mainline Promotion Complete",
          status: "completed",
          conclusion: "success"
        }
      ],
      {
        requiredCheckName: "Mainline Promotion Complete",
        legacyCheckName: "Pipeline Complete",
        commitStageCheckName: "Commit Stage Complete"
      }
    );

    expect(state).toMatchObject({
      status: "success",
      matchedCheckName: "Mainline Promotion Complete"
    });
  });

  it("falls back to the legacy pipeline check during cutover", () => {
    const state = findPromotionCheckState(
      [
        {
          id: 3,
          name: "Pipeline Complete",
          status: "completed",
          conclusion: "success"
        }
      ],
      {
        requiredCheckName: "Mainline Promotion Complete",
        legacyCheckName: "Pipeline Complete",
        commitStageCheckName: "Commit Stage Complete"
      }
    );

    expect(state).toMatchObject({
      status: "success",
      matchedCheckName: "Pipeline Complete"
    });
  });

  it("fails when the latest required promotion check concluded unsuccessfully", () => {
    const state = findPromotionCheckState(
      [
        {
          id: 4,
          name: "Mainline Promotion Complete",
          status: "completed",
          conclusion: "failure"
        },
        {
          id: 1,
          name: "Pipeline Complete",
          status: "completed",
          conclusion: "success"
        }
      ],
      {
        requiredCheckName: "Mainline Promotion Complete",
        legacyCheckName: "Pipeline Complete",
        commitStageCheckName: "Commit Stage Complete"
      }
    );

    expect(state).toMatchObject({
      status: "failure",
      matchedCheckName: "Mainline Promotion Complete",
      conclusion: "failure"
    });
  });

  it("does not fall back to the legacy check for post-cutover commits", () => {
    const state = findPromotionCheckState(
      [
        {
          id: 8,
          name: "Commit Stage Complete",
          status: "completed",
          conclusion: "success"
        },
        {
          id: 7,
          name: "Pipeline Complete",
          status: "completed",
          conclusion: "success"
        }
      ],
      {
        requiredCheckName: "Mainline Promotion Complete",
        legacyCheckName: "Pipeline Complete",
        commitStageCheckName: "Commit Stage Complete"
      }
    );

    expect(state).toMatchObject({
      status: "missing",
      matchedCheckName: "Mainline Promotion Complete"
    });
  });

  it("fails when no previous mainline commit is available", () => {
    expect(() =>
      parsePreviousMainlineCommit(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).toThrow(/previous mainline commit/);
  });
});
