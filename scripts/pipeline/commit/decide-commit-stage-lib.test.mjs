import { describe, expect, it } from "vitest";
import { evaluateCommitStageResults } from "./decide-commit-stage-lib.mjs";

function makeBaseInput(overrides = {}) {
  return {
    checkResults: {
      "determine-scope": "success",
      "fast-feedback": "success",
      "infra-static-check": "skipped",
      "identity-static-check": "skipped"
    },
    infraRequired: false,
    identityRequired: false,
    docsDriftBlocking: false,
    docsDriftStatus: "pass",
    commitStageSloMode: "observe",
    commitStageSloPass: true,
    timeToCommitGateSeconds: 0,
    commitStageSloTargetSeconds: 300,
    ...overrides
  };
}

describe("evaluateCommitStageResults", () => {
  it("always requires determine-scope and fast-feedback success", () => {
    const reasons = evaluateCommitStageResults(
      makeBaseInput({
        checkResults: {
          "determine-scope": "failure",
          "fast-feedback": "cancelled",
          "infra-static-check": "skipped",
          "identity-static-check": "skipped"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_DETERMINE_SCOPE_NOT_SUCCESS",
        message: "determine-scope result is failure"
      },
      {
        code: "CHECK_FAST_FEEDBACK_NOT_SUCCESS",
        message: "fast-feedback result is cancelled"
      }
    ]);
  });

  it("enforces infra and identity checks only when required", () => {
    const reasons = evaluateCommitStageResults(
      makeBaseInput({
        infraRequired: true,
        identityRequired: true,
        checkResults: {
          "determine-scope": "success",
          "fast-feedback": "success",
          "infra-static-check": "failure",
          "identity-static-check": "cancelled"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_INFRA_STATIC_CHECK_REQUIRED_NOT_SUCCESS",
        message: "infra-static-check required but result is failure"
      },
      {
        code: "CHECK_IDENTITY_STATIC_CHECK_REQUIRED_NOT_SUCCESS",
        message: "identity-static-check required but result is cancelled"
      }
    ]);
  });

  it("enforces docs-drift only when blocking flag is true", () => {
    const blockingReasons = evaluateCommitStageResults(
      makeBaseInput({
        docsDriftBlocking: true,
        docsDriftStatus: "fail"
      })
    );
    expect(blockingReasons).toEqual([
      {
        code: "DOCS_DRIFT_BLOCKING_NOT_PASS",
        message: "docs-drift blocking is true but docs_drift_status is fail"
      }
    ]);

    const advisoryReasons = evaluateCommitStageResults(
      makeBaseInput({
        docsDriftBlocking: false,
        docsDriftStatus: "fail"
      })
    );
    expect(advisoryReasons).toEqual([]);
  });

  it("enforces commit-stage timing SLO only in enforce mode", () => {
    const enforceReasons = evaluateCommitStageResults(
      makeBaseInput({
        commitStageSloMode: "enforce",
        commitStageSloPass: false,
        timeToCommitGateSeconds: 342,
        commitStageSloTargetSeconds: 300
      })
    );

    expect(enforceReasons).toEqual([
      {
        code: "COMMIT_STAGE_SLO_NOT_MET",
        message: "commit-stage timing SLO enforce mode requires <= 300s; observed 342s"
      }
    ]);

    const observeReasons = evaluateCommitStageResults(
      makeBaseInput({
        commitStageSloMode: "observe",
        commitStageSloPass: false,
        timeToCommitGateSeconds: 342,
        commitStageSloTargetSeconds: 300
      })
    );

    expect(observeReasons).toEqual([]);
  });
});
