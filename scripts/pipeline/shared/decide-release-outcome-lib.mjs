function normalizeDecision(value, fallback = "NO") {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "YES" || normalized === "NO" || normalized === "REPLAY") {
    return normalized;
  }
  return fallback;
}

function parseReasonCodes(value) {
  if (!value || String(value).trim().length === 0) {
    return [];
  }

  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((entry) => String(entry || "").trim()).filter((entry) => entry.length > 0);
}

function parseBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return fallback;
}

export function evaluateReleaseOutcome(input) {
  const replayMode = parseBoolean(input.replayMode, false);
  const commitStageResult = String(input.commitStageResult || "unknown");
  const loadReleaseCandidateResult = String(input.loadReleaseCandidateResult || "unknown");
  const automatedAcceptanceTestGateResult = String(
    input.automatedAcceptanceTestGateResult || "unknown"
  );
  const deploymentStageResult = String(input.deploymentStageResult || "unknown");

  const acceptanceDecision = normalizeDecision(input.acceptanceDecision, "NO");
  const productionDecision = normalizeDecision(input.productionDecision, "NO");
  const deploymentRequired = parseBoolean(input.deploymentRequired, true);

  let commitStageDecision = "YES";
  if (replayMode) {
    commitStageDecision = "REPLAY";
  } else if (commitStageResult !== "success") {
    commitStageDecision = "NO";
  }

  const acceptanceReasonCodes = parseReasonCodes(input.acceptanceReasonCodes);
  const productionReasonCodes = parseReasonCodes(input.productionReasonCodes);

  const reasonCodes = new Set();
  if (!replayMode && commitStageResult !== "success") {
    reasonCodes.add("COMMIT_STAGE_FAILED");
  }
  if (loadReleaseCandidateResult !== "success") {
    reasonCodes.add("LOAD_RELEASE_CANDIDATE_NOT_SUCCESS");
  }

  if (automatedAcceptanceTestGateResult !== "success" && acceptanceReasonCodes.length === 0) {
    reasonCodes.add("AUTOMATED_ACCEPTANCE_TEST_GATE_NOT_SUCCESS");
  }
  if (acceptanceDecision !== "YES" && acceptanceReasonCodes.length === 0) {
    reasonCodes.add("ACCEPTANCE_DECISION_NOT_YES");
  }

  if (deploymentStageResult !== "success" && productionReasonCodes.length === 0) {
    reasonCodes.add("DEPLOYMENT_STAGE_NOT_SUCCESS");
  }
  if (productionDecision !== "YES" && productionReasonCodes.length === 0) {
    reasonCodes.add("PRODUCTION_DECISION_NOT_YES");
  }

  for (const code of acceptanceReasonCodes) {
    reasonCodes.add(code);
  }
  for (const code of productionReasonCodes) {
    reasonCodes.add(code);
  }

  const releasable = replayMode
    ? acceptanceDecision === "YES" && productionDecision === "YES"
    : commitStageDecision === "YES" &&
      acceptanceDecision === "YES" &&
      productionDecision === "YES" &&
      (deploymentRequired === true || deploymentRequired === false);

  return {
    replayMode,
    deploymentRequired,
    commitStageDecision,
    acceptanceDecision,
    productionDecision,
    releasable,
    reasonCodes: [...reasonCodes]
  };
}
