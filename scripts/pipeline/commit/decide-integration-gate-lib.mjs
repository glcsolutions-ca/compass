export function evaluateIntegrationGateResults({
  checkResults,
  buildRequired,
  migrationRequired,
  runtimeSmokeRequired,
  integrationRequired,
  docsDriftBlocking,
  docsDriftStatus
}) {
  const reasons = [];

  if (checkResults["determine-scope"] !== "success") {
    reasons.push({
      code: "CHECK_DETERMINE_SCOPE_NOT_SUCCESS",
      message: `determine-scope result is ${checkResults["determine-scope"]}`
    });
  }

  if (buildRequired && checkResults["build-compile"] !== "success") {
    reasons.push({
      code: "CHECK_BUILD_COMPILE_REQUIRED_NOT_SUCCESS",
      message: `build-compile required but result is ${checkResults["build-compile"]}`
    });
  }

  if (migrationRequired && checkResults["migration-safety"] !== "success") {
    reasons.push({
      code: "CHECK_MIGRATION_SAFETY_REQUIRED_NOT_SUCCESS",
      message: `migration-safety required but result is ${checkResults["migration-safety"]}`
    });
  }

  if (runtimeSmokeRequired && checkResults["runtime-contract-smoke"] !== "success") {
    reasons.push({
      code: "CHECK_RUNTIME_CONTRACT_SMOKE_REQUIRED_NOT_SUCCESS",
      message: `runtime-contract-smoke required but result is ${checkResults["runtime-contract-smoke"]}`
    });
  }

  if (integrationRequired && checkResults["minimal-integration-smoke"] !== "success") {
    reasons.push({
      code: "CHECK_MINIMAL_INTEGRATION_SMOKE_REQUIRED_NOT_SUCCESS",
      message: `minimal-integration-smoke required but result is ${checkResults["minimal-integration-smoke"]}`
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
