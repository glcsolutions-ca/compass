import { describe, expect, it } from "vitest";
import { evaluateRequiredCheckResults } from "./gate-lib.mjs";

function makeBaseInput(overrides = {}) {
  return {
    checkResults: {
      preflight: "success",
      "ci-pipeline": "success",
      "browser-evidence": "skipped",
      "harness-smoke": "skipped"
    },
    browserRequired: false,
    harnessRequired: false,
    migrationImageRequired: false,
    docsDriftBlocking: false,
    docsDriftStatus: "pass",
    ...overrides
  };
}

describe("evaluateRequiredCheckResults", () => {
  it("always requires preflight and ci-pipeline success", () => {
    const reasons = evaluateRequiredCheckResults(
      makeBaseInput({
        checkResults: {
          preflight: "failure",
          "ci-pipeline": "cancelled",
          "browser-evidence": "skipped",
          "harness-smoke": "skipped"
        }
      })
    );

    expect(reasons).toEqual([
      { code: "CHECK_PREFLIGHT_NOT_SUCCESS", message: "preflight result is failure" },
      { code: "CHECK_CI_PIPELINE_NOT_SUCCESS", message: "ci-pipeline result is cancelled" }
    ]);
  });

  it("enforces browser and harness checks only when required", () => {
    const reasons = evaluateRequiredCheckResults(
      makeBaseInput({
        browserRequired: true,
        harnessRequired: true,
        checkResults: {
          preflight: "success",
          "ci-pipeline": "success",
          "browser-evidence": "skipped",
          "harness-smoke": "failure"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_BROWSER_EVIDENCE_REQUIRED_NOT_SUCCESS",
        message: "browser-evidence required but result is skipped"
      },
      {
        code: "CHECK_HARNESS_SMOKE_REQUIRED_NOT_SUCCESS",
        message: "harness-smoke required but result is failure"
      }
    ]);
  });

  it("enforces migration-image-smoke only when required", () => {
    const reasons = evaluateRequiredCheckResults(
      makeBaseInput({
        migrationImageRequired: true,
        checkResults: {
          preflight: "success",
          "ci-pipeline": "success",
          "browser-evidence": "skipped",
          "harness-smoke": "skipped",
          "migration-image-smoke": "failure"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_MIGRATION_IMAGE_SMOKE_REQUIRED_NOT_SUCCESS",
        message: "migration-image-smoke required but result is failure"
      }
    ]);
  });

  it("enforces docs-drift only when blocking flag is true", () => {
    const blockingReasons = evaluateRequiredCheckResults(
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

    const advisoryReasons = evaluateRequiredCheckResults(
      makeBaseInput({
        docsDriftBlocking: false,
        docsDriftStatus: "fail"
      })
    );
    expect(advisoryReasons).toEqual([]);
  });
});
