export function evaluateRequiredCheckResults({
  checkResults,
  browserRequired,
  harnessRequired,
  migrationImageRequired,
  docsDriftBlocking,
  docsDriftStatus
}) {
  const reasons = [];

  if (checkResults.preflight !== "success") {
    reasons.push({
      code: "CHECK_PREFLIGHT_NOT_SUCCESS",
      message: `preflight result is ${checkResults.preflight}`
    });
  }

  if (checkResults["ci-pipeline"] !== "success") {
    reasons.push({
      code: "CHECK_CI_PIPELINE_NOT_SUCCESS",
      message: `ci-pipeline result is ${checkResults["ci-pipeline"]}`
    });
  }

  if (browserRequired && checkResults["browser-evidence"] !== "success") {
    reasons.push({
      code: "CHECK_BROWSER_EVIDENCE_REQUIRED_NOT_SUCCESS",
      message: `browser-evidence required but result is ${checkResults["browser-evidence"]}`
    });
  }

  if (harnessRequired && checkResults["harness-smoke"] !== "success") {
    reasons.push({
      code: "CHECK_HARNESS_SMOKE_REQUIRED_NOT_SUCCESS",
      message: `harness-smoke required but result is ${checkResults["harness-smoke"]}`
    });
  }

  if (migrationImageRequired && checkResults["migration-image-smoke"] !== "success") {
    reasons.push({
      code: "CHECK_MIGRATION_IMAGE_SMOKE_REQUIRED_NOT_SUCCESS",
      message: `migration-image-smoke required but result is ${checkResults["migration-image-smoke"]}`
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
