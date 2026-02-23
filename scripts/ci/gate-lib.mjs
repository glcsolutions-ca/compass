export function evaluateRequiredCheckResults({
  checkResults,
  browserRequired,
  harnessRequired,
  docsDriftBlocking,
  docsDriftStatus
}) {
  const reasons = [];

  if (checkResults.preflight !== "success") {
    reasons.push(`preflight result is ${checkResults.preflight}`);
  }

  if (checkResults["ci-pipeline"] !== "success") {
    reasons.push(`ci-pipeline result is ${checkResults["ci-pipeline"]}`);
  }

  if (browserRequired && checkResults["browser-evidence"] !== "success") {
    reasons.push(`browser-evidence required but result is ${checkResults["browser-evidence"]}`);
  }

  if (harnessRequired && checkResults["harness-smoke"] !== "success") {
    reasons.push(`harness-smoke required but result is ${checkResults["harness-smoke"]}`);
  }

  if (docsDriftBlocking && docsDriftStatus !== "pass") {
    reasons.push(`docs-drift blocking is true but docs_drift_status is ${docsDriftStatus}`);
  }

  return reasons;
}
