export function evaluateAcceptanceStageResults({
  checkResults,
  runtimeRequired,
  infraRequired,
  identityRequired
}) {
  const reasons = [];

  if (checkResults["load-candidate"] !== "success") {
    reasons.push({
      code: "CHECK_LOAD_CANDIDATE_NOT_SUCCESS",
      message: `load-candidate result is ${checkResults["load-candidate"]}`
    });
  }

  if (runtimeRequired && checkResults["runtime-acceptance"] !== "success") {
    reasons.push({
      code: "CHECK_RUNTIME_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
      message: `runtime-acceptance required but result is ${checkResults["runtime-acceptance"]}`
    });
  }

  if (infraRequired && checkResults["infra-acceptance"] !== "success") {
    reasons.push({
      code: "CHECK_INFRA_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
      message: `infra-acceptance required but result is ${checkResults["infra-acceptance"]}`
    });
  }

  if (identityRequired && checkResults["identity-acceptance"] !== "success") {
    reasons.push({
      code: "CHECK_IDENTITY_ACCEPTANCE_REQUIRED_NOT_SUCCESS",
      message: `identity-acceptance required but result is ${checkResults["identity-acceptance"]}`
    });
  }

  return reasons;
}
