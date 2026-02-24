import { describe, expect, it } from "vitest";
import { evaluateAcceptanceStageResults } from "./acceptance-stage-gate-lib.mjs";

function base(overrides = {}) {
  return {
    checkResults: {
      "load-candidate": "success",
      "runtime-acceptance": "skipped",
      "infra-acceptance": "skipped",
      "identity-acceptance": "skipped"
    },
    runtimeRequired: false,
    infraRequired: false,
    identityRequired: false,
    ...overrides
  };
}

describe("evaluateAcceptanceStageResults", () => {
  it("always requires load-candidate", () => {
    const reasons = evaluateAcceptanceStageResults(
      base({
        checkResults: {
          "load-candidate": "failure",
          "runtime-acceptance": "skipped",
          "infra-acceptance": "skipped",
          "identity-acceptance": "skipped"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_LOAD_CANDIDATE_NOT_SUCCESS",
        message: "load-candidate result is failure"
      }
    ]);
  });

  it("requires runtime/infra/identity checks only when needed", () => {
    const reasons = evaluateAcceptanceStageResults(
      base({
        runtimeRequired: true,
        infraRequired: true,
        identityRequired: true,
        checkResults: {
          "load-candidate": "success",
          "runtime-acceptance": "failure",
          "infra-acceptance": "cancelled",
          "identity-acceptance": "timed_out"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_RUNTIME_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
        message: "runtime-acceptance required but result is failure"
      },
      {
        code: "CHECK_INFRA_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
        message: "infra-acceptance required but result is cancelled"
      },
      {
        code: "CHECK_IDENTITY_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
        message: "identity-acceptance required but result is timed_out"
      }
    ]);
  });
});
