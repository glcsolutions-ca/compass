export function evaluateCommitStageResults({
  checkResults,
  infraRequired,
  identityRequired,
  docsDriftBlocking,
  docsDriftStatus,
  commitStageSloMode,
  commitStageSloPass,
  timeToCommitGateSeconds,
  commitStageSloTargetSeconds
}) {
  const reasons = [];

  if (checkResults["determine-scope"] !== "success") {
    reasons.push({
      code: "CHECK_DETERMINE_SCOPE_NOT_SUCCESS",
      message: `determine-scope result is ${checkResults["determine-scope"]}`
    });
  }

  if (checkResults["fast-feedback"] !== "success") {
    reasons.push({
      code: "CHECK_FAST_FEEDBACK_NOT_SUCCESS",
      message: `fast-feedback result is ${checkResults["fast-feedback"]}`
    });
  }

  if (infraRequired && checkResults["infra-static-check"] !== "success") {
    reasons.push({
      code: "CHECK_INFRA_STATIC_CHECK_REQUIRED_NOT_SUCCESS",
      message: `infra-static-check required but result is ${checkResults["infra-static-check"]}`
    });
  }

  if (identityRequired && checkResults["identity-static-check"] !== "success") {
    reasons.push({
      code: "CHECK_IDENTITY_STATIC_CHECK_REQUIRED_NOT_SUCCESS",
      message: `identity-static-check required but result is ${checkResults["identity-static-check"]}`
    });
  }

  if (docsDriftBlocking && docsDriftStatus !== "pass") {
    reasons.push({
      code: "DOCS_DRIFT_BLOCKING_NOT_PASS",
      message: `docs-drift blocking is true but docs_drift_status is ${docsDriftStatus}`
    });
  }

  if (commitStageSloMode === "enforce" && !commitStageSloPass) {
    const observed = Number.isFinite(timeToCommitGateSeconds)
      ? `${timeToCommitGateSeconds}s`
      : "unknown";
    const target = Number.isFinite(commitStageSloTargetSeconds)
      ? `${commitStageSloTargetSeconds}s`
      : "unknown";
    reasons.push({
      code: "COMMIT_STAGE_SLO_NOT_MET",
      message: `commit-stage timing SLO enforce mode requires <= ${target}; observed ${observed}`
    });
  }

  return reasons;
}
