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
      "preflight result is failure",
      "ci-pipeline result is cancelled"
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
      "browser-evidence required but result is skipped",
      "harness-smoke required but result is failure"
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
      "docs-drift blocking is true but docs_drift_status is fail"
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
