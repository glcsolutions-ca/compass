import {
  DEFAULT_TEST_POLICY_PATH,
  loadTestPolicySync
} from "../../../scripts/pipeline/commit/testing-policy.mjs";

function normalizeModeKey(mode) {
  if (mode === "commit-stage") {
    return "commitStage";
  }

  return mode;
}

export function resolveTestPolicyPath() {
  const envPath = process.env.TEST_POLICY_PATH?.trim();
  return envPath && envPath.length > 0 ? envPath : DEFAULT_TEST_POLICY_PATH;
}

export function loadRuntimeModePolicy(mode) {
  const normalizedMode = normalizeModeKey(mode);
  const policyPath = resolveTestPolicyPath();
  const policy = loadTestPolicySync(policyPath);
  const runtimeMode = policy.runtime.modes[normalizedMode];

  if (!runtimeMode) {
    throw new Error(
      `test policy runtime mode "${normalizedMode}" is not configured in ${policyPath}`
    );
  }

  return {
    mode: normalizedMode === "commitStage" ? "commit-stage" : normalizedMode,
    allowLoopbackOnly: runtimeMode.allowLoopbackOnly,
    allowPostgres: runtimeMode.allowPostgres,
    blockChildProcess: runtimeMode.blockChildProcess,
    blockedPorts: runtimeMode.blockedPorts
  };
}
