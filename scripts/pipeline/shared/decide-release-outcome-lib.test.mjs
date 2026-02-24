import { describe, expect, it } from "vitest";
import { evaluateReleaseOutcome } from "./decide-release-outcome-lib.mjs";

function base(overrides = {}) {
  return {
    replayMode: false,
    commitStageResult: "success",
    loadReleasePackageResult: "success",
    acceptanceStageResult: "success",
    productionStageResult: "success",
    acceptanceDecision: "YES",
    acceptanceReasonCodes: "[]",
    productionDecision: "YES",
    productionReasonCodes: "[]",
    deployRequired: true,
    ...overrides
  };
}

describe("evaluateReleaseOutcome", () => {
  it("returns releaseable for docs-only non-deploy candidates", () => {
    const result = evaluateReleaseOutcome(
      base({
        deployRequired: false,
        acceptanceReasonCodes: '["DOCS_ONLY_CHANGE"]',
        productionReasonCodes: '["DOCS_ONLY_CHANGE"]'
      })
    );

    expect(result.releaseable).toBe(true);
    expect(result.acceptanceDecision).toBe("YES");
    expect(result.productionDecision).toBe("YES");
    expect(result.reasonCodes).toContain("DOCS_ONLY_CHANGE");
  });

  it("fails closed when load release package is not successful", () => {
    const result = evaluateReleaseOutcome(
      base({
        loadReleasePackageResult: "skipped",
        acceptanceDecision: "NO",
        productionDecision: "NO"
      })
    );

    expect(result.releaseable).toBe(false);
    expect(result.reasonCodes).toContain("LOAD_RELEASE_PACKAGE_NOT_SUCCESS");
  });

  it("propagates explicit acceptance and production reason codes", () => {
    const result = evaluateReleaseOutcome(
      base({
        acceptanceDecision: "NO",
        productionDecision: "NO",
        acceptanceReasonCodes: '["ACCEPTANCE_GATE_FAILED"]',
        productionReasonCodes: '["DEPLOY_RELEASE_PACKAGE_FAILED"]'
      })
    );

    expect(result.releaseable).toBe(false);
    expect(result.reasonCodes).toContain("ACCEPTANCE_GATE_FAILED");
    expect(result.reasonCodes).toContain("DEPLOY_RELEASE_PACKAGE_FAILED");
  });
});
