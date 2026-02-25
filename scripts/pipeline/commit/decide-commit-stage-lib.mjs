export function evaluateCommitStageResults({
  checkResults,
  runtimeRequired,
  desktopRequired,
  infraRequired,
  identityRequired,
  pairingRequired,
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

  if (runtimeRequired && checkResults["commit-test-suite"] !== "success") {
    reasons.push({
      code: "CHECK_RUNTIME_FAST_FEEDBACK_REQUIRED_NOT_SUCCESS",
      message: `commit-test-suite required but result is ${checkResults["commit-test-suite"]}`
    });
  }

  if (desktopRequired && checkResults["desktop-commit-test-suite"] !== "success") {
    reasons.push({
      code: "CHECK_DESKTOP_FAST_FEEDBACK_REQUIRED_NOT_SUCCESS",
      message: `desktop-commit-test-suite required but result is ${checkResults["desktop-commit-test-suite"]}`
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

  if (pairingRequired && checkResults["pairing-evidence-check"] !== "success") {
    reasons.push({
      code: "CHECK_PAIRING_EVIDENCE_REQUIRED_NOT_SUCCESS",
      message: `pairing-evidence-check required but result is ${checkResults["pairing-evidence-check"]}`
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
