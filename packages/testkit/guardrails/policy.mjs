const DEFAULT_RUNTIME_POLICY = {
  commitStage: {
    allowLoopbackOnly: true,
    allowPostgres: false,
    blockChildProcess: true,
    blockedPorts: [5432]
  },
  integration: {
    allowLoopbackOnly: true,
    allowPostgres: true,
    blockChildProcess: false,
    blockedPorts: []
  }
};

function normalizeModeKey(mode) {
  if (mode === "commit-stage") {
    return "commitStage";
  }

  return mode;
}

export function resolveTestPolicyPath() {
  return process.env.TEST_POLICY_PATH?.trim() || "embedded-default-policy";
}

export function loadRuntimeModePolicy(mode) {
  const normalizedMode = normalizeModeKey(mode);
  const runtimeMode = DEFAULT_RUNTIME_POLICY[normalizedMode];

  if (!runtimeMode) {
    throw new Error(`test policy runtime mode "${normalizedMode}" is not configured`);
  }

  return {
    mode: normalizedMode === "commitStage" ? "commit-stage" : normalizedMode,
    allowLoopbackOnly: runtimeMode.allowLoopbackOnly,
    allowPostgres: runtimeMode.allowPostgres,
    blockChildProcess: runtimeMode.blockChildProcess,
    blockedPorts: runtimeMode.blockedPorts
  };
}
