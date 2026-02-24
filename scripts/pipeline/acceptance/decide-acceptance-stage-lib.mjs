export function evaluateAcceptanceStageResults({
  checkResults,
  runtimeRequired,
  infraRequired,
  identityRequired,
  candidateRefContractStatus,
  candidateRefContractReasonCodes,
  identityConfigContractStatus,
  identityConfigContractReasonCodes
}) {
  const reasons = [];

  if (checkResults["load-release-candidate"] !== "success") {
    reasons.push({
      code: "CHECK_LOAD_RELEASE_CANDIDATE_NOT_SUCCESS",
      message: `load-release-candidate result is ${checkResults["load-release-candidate"]}`
    });
  }

  if (runtimeRequired && checkResults["runtime-blackbox-acceptance"] !== "success") {
    reasons.push({
      code: "CHECK_RUNTIME_BLACKBOX_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
      message: `runtime-blackbox-acceptance required but result is ${checkResults["runtime-blackbox-acceptance"]}`
    });
  }

  if (infraRequired && checkResults["infra-readonly-acceptance"] !== "success") {
    reasons.push({
      code: "CHECK_INFRA_READONLY_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
      message: `infra-readonly-acceptance required but result is ${checkResults["infra-readonly-acceptance"]}`
    });
  }

  if (identityRequired && checkResults["identity-readonly-acceptance"] !== "success") {
    reasons.push({
      code: "CHECK_IDENTITY_READONLY_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
      message: `identity-readonly-acceptance required but result is ${checkResults["identity-readonly-acceptance"]}`
    });
  }

  if ((runtimeRequired || infraRequired) && candidateRefContractStatus !== "pass") {
    const reasonSuffix =
      Array.isArray(candidateRefContractReasonCodes) && candidateRefContractReasonCodes.length > 0
        ? ` (${candidateRefContractReasonCodes.join(", ")})`
        : "";

    reasons.push({
      code: "CONFIG_CONTRACT_CANDIDATE_REFS_NOT_PASS",
      message: `candidate ref contract required for runtime/infra acceptance but status is ${candidateRefContractStatus}${reasonSuffix}`
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
