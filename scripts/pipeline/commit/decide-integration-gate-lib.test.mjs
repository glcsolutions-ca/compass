import { describe, expect, it } from "vitest";
import { evaluateIntegrationGateResults } from "./decide-integration-gate-lib.mjs";

function baseInput() {
  return {
    checkResults: {
      "determine-scope": "success",
      "build-compile": "success",
      "migration-safety": "success",
      "auth-critical-smoke": "success",
      "minimal-integration-smoke": "success"
    },
    buildRequired: true,
    migrationRequired: false,
    authRequired: true,
    integrationRequired: true,
    docsDriftBlocking: false,
    docsDriftStatus: "pass"
  };
}

describe("evaluateIntegrationGateResults", () => {
  it("passes with all required checks successful", () => {
    const reasons = evaluateIntegrationGateResults(baseInput());
    expect(reasons).toEqual([]);
  });

  it("fails when determine-scope is not successful", () => {
    const input = baseInput();
    input.checkResults["determine-scope"] = "failure";

    const reasons = evaluateIntegrationGateResults(input);
    expect(reasons).toEqual([
      {
        code: "CHECK_DETERMINE_SCOPE_NOT_SUCCESS",
        message: "determine-scope result is failure"
      }
    ]);
  });

  it("fails required checks and docs drift when set", () => {
    const input = baseInput();
    input.checkResults["build-compile"] = "timed_out";
    input.checkResults["auth-critical-smoke"] = "cancelled";
    input.checkResults["minimal-integration-smoke"] = "skipped";
    input.buildRequired = true;
    input.authRequired = true;
    input.integrationRequired = true;
    input.docsDriftBlocking = true;
    input.docsDriftStatus = "fail";

    const reasons = evaluateIntegrationGateResults(input);
    expect(reasons).toEqual([
      {
        code: "CHECK_BUILD_COMPILE_REQUIRED_NOT_SUCCESS",
        message: "build-compile required but result is timed_out"
      },
      {
        code: "CHECK_AUTH_CRITICAL_SMOKE_REQUIRED_NOT_SUCCESS",
        message: "auth-critical-smoke required but result is cancelled"
      },
      {
        code: "CHECK_MINIMAL_INTEGRATION_SMOKE_REQUIRED_NOT_SUCCESS",
        message: "minimal-integration-smoke required but result is skipped"
      },
      {
        code: "DOCS_DRIFT_BLOCKING_NOT_PASS",
        message: "docs-drift blocking is true but docs_drift_status is fail"
      }
    ]);
  });

  it("does not fail optional checks when not required", () => {
    const input = baseInput();
    input.checkResults["migration-safety"] = "skipped";
    input.checkResults["minimal-integration-smoke"] = "skipped";
    input.migrationRequired = false;
    input.integrationRequired = false;

    const reasons = evaluateIntegrationGateResults(input);
    expect(reasons).toEqual([]);
  });

  it("fails migration safety when migrations are required", () => {
    const input = baseInput();
    input.migrationRequired = true;
    input.checkResults["migration-safety"] = "failure";

    const reasons = evaluateIntegrationGateResults(input);
    expect(reasons).toEqual([
      {
        code: "CHECK_MIGRATION_SAFETY_REQUIRED_NOT_SUCCESS",
        message: "migration-safety required but result is failure"
      }
    ]);
  });
});
