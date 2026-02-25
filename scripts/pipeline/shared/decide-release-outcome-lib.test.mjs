import { describe, expect, it } from "vitest";
import { evaluateReleaseOutcome } from "./decide-release-outcome-lib.mjs";

function base(overrides = {}) {
  return {
    replayMode: false,
    commitStageResult: "success",
    loadReleaseCandidateResult: "success",
    automatedAcceptanceTestGateResult: "success",
    deploymentStageResult: "success",
    acceptanceDecision: "YES",
    acceptanceReasonCodes: "[]",
    productionDecision: "YES",
    productionReasonCodes: "[]",
    deploymentRequired: true,
    ...overrides
  };
}

describe("evaluateReleaseOutcome", () => {
  it("returns releasable for docs-only non-deploy candidates", () => {
    const result = evaluateReleaseOutcome(
      base({
        deploymentRequired: false,
        acceptanceReasonCodes: '["DOCS_ONLY_CHANGE"]',
        productionReasonCodes: '["DOCS_ONLY_CHANGE"]'
      })
    );

    expect(result.releasable).toBe(true);
    expect(result.acceptanceDecision).toBe("YES");
    expect(result.productionDecision).toBe("YES");
    expect(result.reasonCodes).toContain("DOCS_ONLY_CHANGE");
  });

  it("fails closed when load release candidate is not successful", () => {
    const result = evaluateReleaseOutcome(
      base({
        loadReleaseCandidateResult: "skipped",
        acceptanceDecision: "NO",
        productionDecision: "NO"
      })
    );

    expect(result.releasable).toBe(false);
    expect(result.reasonCodes).toContain("LOAD_RELEASE_CANDIDATE_NOT_SUCCESS");
  });

  it("propagates explicit automated-acceptance-test-gate and deployment-stage reason codes", () => {
    const result = evaluateReleaseOutcome(
      base({
        acceptanceDecision: "NO",
        productionDecision: "NO",
        acceptanceReasonCodes: '["ACCEPTANCE_GATE_FAILED"]',
        productionReasonCodes: '["DEPLOY_RELEASE_CANDIDATE_FAILED"]'
      })
    );

    expect(result.releasable).toBe(false);
    expect(result.reasonCodes).toContain("ACCEPTANCE_GATE_FAILED");
    expect(result.reasonCodes).toContain("DEPLOY_RELEASE_CANDIDATE_FAILED");
  });
});
