export function evaluateAcceptanceStageResults({
  checkResults,
  runtimeRequired,
  infraRequired,
  identityRequired,
  releaseCandidateRefContractStatus,
  releaseCandidateRefContractReasonCodes,
  identityConfigContractStatus,
  identityConfigContractReasonCodes
}) {
  const reasons = [];

  function pushRequiredCheckOutcome({ required, checkName, result, failureCode, failureMessage }) {
    if (!required || result === "success") {
      return;
    }

    if (result === "skipped") {
      reasons.push({
        code: "REQUIRED_CHECK_SKIPPED_UNEXPECTEDLY",
        message: `${checkName} required but result is skipped`
      });
      return;
    }

    reasons.push({
      code: failureCode,
      message: failureMessage
    });
  }

  if (checkResults["load-release-candidate"] !== "success") {
    reasons.push({
      code: "CHECK_LOAD_RELEASE_CANDIDATE_NOT_SUCCESS",
      message: `load-release-candidate result is ${checkResults["load-release-candidate"]}`
    });
  }

  pushRequiredCheckOutcome({
    required: runtimeRequired,
    checkName: "runtime-api-system-acceptance",
    result: checkResults["runtime-api-system-acceptance"],
    failureCode: "CHECK_RUNTIME_API_SYSTEM_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
    failureMessage: `runtime-api-system-acceptance required but result is ${checkResults["runtime-api-system-acceptance"]}`
  });

  pushRequiredCheckOutcome({
    required: runtimeRequired,
    checkName: "runtime-browser-acceptance",
    result: checkResults["runtime-browser-acceptance"],
    failureCode: "CHECK_RUNTIME_BROWSER_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
    failureMessage: `runtime-browser-acceptance required but result is ${checkResults["runtime-browser-acceptance"]}`
  });

  pushRequiredCheckOutcome({
    required: runtimeRequired,
    checkName: "runtime-migration-image-acceptance",
    result: checkResults["runtime-migration-image-acceptance"],
    failureCode: "CHECK_RUNTIME_MIGRATION_IMAGE_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
    failureMessage: `runtime-migration-image-acceptance required but result is ${checkResults["runtime-migration-image-acceptance"]}`
  });

  pushRequiredCheckOutcome({
    required: infraRequired,
    checkName: "infra-readonly-acceptance",
    result: checkResults["infra-readonly-acceptance"],
    failureCode: "CHECK_INFRA_READONLY_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
    failureMessage: `infra-readonly-acceptance required but result is ${checkResults["infra-readonly-acceptance"]}`
  });

  pushRequiredCheckOutcome({
    required: identityRequired,
    checkName: "identity-readonly-acceptance",
    result: checkResults["identity-readonly-acceptance"],
    failureCode: "CHECK_IDENTITY_READONLY_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
    failureMessage: `identity-readonly-acceptance required but result is ${checkResults["identity-readonly-acceptance"]}`
  });

  if ((runtimeRequired || infraRequired) && releaseCandidateRefContractStatus !== "pass") {
    const reasonSuffix =
      Array.isArray(releaseCandidateRefContractReasonCodes) &&
      releaseCandidateRefContractReasonCodes.length > 0
        ? ` (${releaseCandidateRefContractReasonCodes.join(", ")})`
        : "";

    reasons.push({
      code: "CONFIG_CONTRACT_RELEASE_CANDIDATE_REFS_NOT_PASS",
      message: `release candidate ref contract required for runtime/infra acceptance but status is ${releaseCandidateRefContractStatus}${reasonSuffix}`
    });
  }

  if (identityRequired && identityConfigContractStatus !== "pass") {
    const reasonSuffix =
      Array.isArray(identityConfigContractReasonCodes) &&
      identityConfigContractReasonCodes.length > 0
        ? ` (${identityConfigContractReasonCodes.join(", ")})`
        : "";

    reasons.push({
      code: "CONFIG_CONTRACT_IDENTITY_NOT_PASS",
      message: `identity config contract required for acceptance but status is ${identityConfigContractStatus}${reasonSuffix}`
    });
  }

  return reasons;
}
