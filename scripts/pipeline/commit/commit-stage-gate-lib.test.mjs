import { describe, expect, it } from "vitest";
import { evaluateCommitStageResults } from "./commit-stage-gate-lib.mjs";

function makeBaseInput(overrides = {}) {
  return {
    checkResults: {
      scope: "success",
      "quick-feedback": "success",
      "infra-quick-check": "skipped",
      "identity-quick-check": "skipped"
    },
    infraRequired: false,
    identityRequired: false,
    docsDriftBlocking: false,
    docsDriftStatus: "pass",
    ...overrides
  };
}

describe("evaluateCommitStageResults", () => {
  it("always requires scope and quick-feedback success", () => {
    const reasons = evaluateCommitStageResults(
      makeBaseInput({
        checkResults: {
          scope: "failure",
          "quick-feedback": "cancelled",
          "infra-quick-check": "skipped",
          "identity-quick-check": "skipped"
        }
      })
    );

    expect(reasons).toEqual([
      { code: "CHECK_SCOPE_NOT_SUCCESS", message: "scope result is failure" },
      {
        code: "CHECK_QUICK_FEEDBACK_NOT_SUCCESS",
        message: "quick-feedback result is cancelled"
      }
    ]);
  });

  it("enforces infra and identity checks only when required", () => {
    const reasons = evaluateCommitStageResults(
      makeBaseInput({
        infraRequired: true,
        identityRequired: true,
        checkResults: {
          scope: "success",
          "quick-feedback": "success",
          "infra-quick-check": "failure",
          "identity-quick-check": "cancelled"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_INFRA_QUICK_CHECK_REQUIRED_NOT_SUCCESS",
        message: "infra-quick-check required but result is failure"
      },
      {
        code: "CHECK_IDENTITY_QUICK_CHECK_REQUIRED_NOT_SUCCESS",
        message: "identity-quick-check required but result is cancelled"
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
});
