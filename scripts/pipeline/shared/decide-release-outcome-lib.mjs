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
  const loadReleasePackageResult = String(input.loadReleasePackageResult || "unknown");
  const acceptanceStageResult = String(input.acceptanceStageResult || "unknown");
  const productionStageResult = String(input.productionStageResult || "unknown");

  const acceptanceDecision = normalizeDecision(input.acceptanceDecision, "NO");
  const productionDecision = normalizeDecision(input.productionDecision, "NO");
  const deployRequired = parseBoolean(input.deployRequired, true);

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
  if (loadReleasePackageResult !== "success") {
    reasonCodes.add("LOAD_RELEASE_PACKAGE_NOT_SUCCESS");
  }

  if (acceptanceStageResult !== "success" && acceptanceReasonCodes.length === 0) {
    reasonCodes.add("ACCEPTANCE_STAGE_NOT_SUCCESS");
  }
  if (acceptanceDecision !== "YES" && acceptanceReasonCodes.length === 0) {
    reasonCodes.add("ACCEPTANCE_DECISION_NOT_YES");
  }

  if (productionStageResult !== "success" && productionReasonCodes.length === 0) {
    reasonCodes.add("PRODUCTION_STAGE_NOT_SUCCESS");
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

  const releaseable = replayMode
    ? acceptanceDecision === "YES" && productionDecision === "YES"
    : commitStageDecision === "YES" &&
      acceptanceDecision === "YES" &&
      productionDecision === "YES" &&
      (deployRequired === true || deployRequired === false);

  return {
    replayMode,
    deployRequired,
    commitStageDecision,
    acceptanceDecision,
    productionDecision,
    releaseable,
    reasonCodes: [...reasonCodes]
  };
}
