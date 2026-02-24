export function evaluateCommitStageResults({
  checkResults,
  infraRequired,
  identityRequired,
  docsDriftBlocking,
  docsDriftStatus
}) {
  const reasons = [];

  if (checkResults.scope !== "success") {
    reasons.push({
      code: "CHECK_SCOPE_NOT_SUCCESS",
      message: `scope result is ${checkResults.scope}`
    });
  }

  if (checkResults["quick-feedback"] !== "success") {
    reasons.push({
      code: "CHECK_QUICK_FEEDBACK_NOT_SUCCESS",
      message: `quick-feedback result is ${checkResults["quick-feedback"]}`
    });
  }

  if (infraRequired && checkResults["infra-quick-check"] !== "success") {
    reasons.push({
      code: "CHECK_INFRA_QUICK_CHECK_REQUIRED_NOT_SUCCESS",
      message: `infra-quick-check required but result is ${checkResults["infra-quick-check"]}`
    });
  }

  if (identityRequired && checkResults["identity-quick-check"] !== "success") {
    reasons.push({
      code: "CHECK_IDENTITY_QUICK_CHECK_REQUIRED_NOT_SUCCESS",
      message: `identity-quick-check required but result is ${checkResults["identity-quick-check"]}`
    });
  }

  if (docsDriftBlocking && docsDriftStatus !== "pass") {
    reasons.push({
      code: "DOCS_DRIFT_BLOCKING_NOT_PASS",
      message: `docs-drift blocking is true but docs_drift_status is ${docsDriftStatus}`
    });
  }

  return reasons;
}
