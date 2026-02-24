import { describe, expect, it } from "vitest";
import { evaluateAcceptanceStageResults } from "./decide-acceptance-stage-lib.mjs";

function base(overrides = {}) {
  return {
    checkResults: {
      "load-release-candidate": "success",
      "runtime-api-system-acceptance": "skipped",
      "runtime-browser-acceptance": "skipped",
      "runtime-migration-image-acceptance": "skipped",
      "infra-readonly-acceptance": "skipped",
      "identity-readonly-acceptance": "skipped"
    },
    runtimeRequired: false,
    infraRequired: false,
    identityRequired: false,
    candidateRefContractStatus: "pass",
    candidateRefContractReasonCodes: [],
    identityConfigContractStatus: "pass",
    identityConfigContractReasonCodes: [],
    ...overrides
  };
}

describe("evaluateAcceptanceStageResults", () => {
  it("always requires load-release-candidate", () => {
    const reasons = evaluateAcceptanceStageResults(
      base({
        checkResults: {
          "load-release-candidate": "failure",
          "runtime-api-system-acceptance": "skipped",
          "runtime-browser-acceptance": "skipped",
          "runtime-migration-image-acceptance": "skipped",
          "infra-readonly-acceptance": "skipped",
          "identity-readonly-acceptance": "skipped"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_LOAD_RELEASE_CANDIDATE_NOT_SUCCESS",
        message: "load-release-candidate result is failure"
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
          "load-release-candidate": "success",
          "runtime-api-system-acceptance": "failure",
          "runtime-browser-acceptance": "cancelled",
          "runtime-migration-image-acceptance": "timed_out",
          "infra-readonly-acceptance": "cancelled",
          "identity-readonly-acceptance": "timed_out"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "CHECK_RUNTIME_API_SYSTEM_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
        message: "runtime-api-system-acceptance required but result is failure"
      },
      {
        code: "CHECK_RUNTIME_BROWSER_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
        message: "runtime-browser-acceptance required but result is cancelled"
      },
      {
        code: "CHECK_RUNTIME_MIGRATION_IMAGE_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
        message: "runtime-migration-image-acceptance required but result is timed_out"
      },
      {
        code: "CHECK_INFRA_READONLY_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
        message: "infra-readonly-acceptance required but result is cancelled"
      },
      {
        code: "CHECK_IDENTITY_READONLY_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
        message: "identity-readonly-acceptance required but result is timed_out"
      }
    ]);
  });

  it("emits explicit reason code when a required check is skipped", () => {
    const reasons = evaluateAcceptanceStageResults(
      base({
        infraRequired: true,
        checkResults: {
          "load-release-candidate": "success",
          "runtime-api-system-acceptance": "skipped",
          "runtime-browser-acceptance": "skipped",
          "runtime-migration-image-acceptance": "skipped",
          "infra-readonly-acceptance": "skipped",
          "identity-readonly-acceptance": "skipped"
        }
      })
    );

    expect(reasons).toEqual([
      {
        code: "REQUIRED_CHECK_SKIPPED_UNEXPECTEDLY",
        message: "infra-readonly-acceptance required but result is skipped"
      }
    ]);
  });

  it("reports explicit config contract violations", () => {
    const reasons = evaluateAcceptanceStageResults(
      base({
        runtimeRequired: true,
        identityRequired: true,
        checkResults: {
          "load-release-candidate": "success",
          "runtime-api-system-acceptance": "success",
          "runtime-browser-acceptance": "success",
          "runtime-migration-image-acceptance": "success",
          "infra-readonly-acceptance": "skipped",
          "identity-readonly-acceptance": "success"
        },
        candidateRefContractStatus: "fail",
        candidateRefContractReasonCodes: ["CANDIDATE_API_REF_MISSING"],
        identityConfigContractStatus: "fail",
        identityConfigContractReasonCodes: ["IDENTITY_API_IDENTIFIER_URI_INVALID_FORMAT"]
      })
    );

    expect(reasons).toEqual([
      {
        code: "CONFIG_CONTRACT_CANDIDATE_REFS_NOT_PASS",
        message:
          "candidate ref contract required for runtime/infra acceptance but status is fail (CANDIDATE_API_REF_MISSING)"
      },
      {
        code: "CONFIG_CONTRACT_IDENTITY_NOT_PASS",
        message:
          "identity config contract required for acceptance but status is fail (IDENTITY_API_IDENTIFIER_URI_INVALID_FORMAT)"
      }
    ]);
  });
});
