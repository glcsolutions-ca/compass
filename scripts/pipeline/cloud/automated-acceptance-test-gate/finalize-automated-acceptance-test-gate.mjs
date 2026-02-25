import path from "node:path";
import {
  appendGithubOutput,
  fileExists,
  readJsonFile,
  requireEnv,
  writeJsonFile
} from "../../shared/pipeline-utils.mjs";

function parseBoolean(value, fallback = false) {
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

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const deploymentRequired = parseBoolean(process.env.DEPLOYMENT_REQUIRED, true);
  const deploySkipReasonCode =
    String(process.env.DEPLOY_SKIP_REASON_CODE || "").trim() || "NO_DEPLOYMENT_REQUIRED";
  const decideOutcome = String(process.env.DECIDE_OUTCOME || "unknown").trim();

  const resultPath = path.join(
    ".artifacts",
    "automated-acceptance-test-gate",
    headSha,
    "result.json"
  );
  const hasExistingResult = await fileExists(resultPath);
  const existingResult = hasExistingResult ? await readJsonFile(resultPath) : {};

  let acceptanceDecision = "YES";
  let reasonCodes = [];
  let reasonMessage = "";

  if (deploymentRequired) {
    if (decideOutcome !== "success") {
      acceptanceDecision = "NO";
    }

    if (Array.isArray(existingResult?.reasonCodes)) {
      reasonCodes = existingResult.reasonCodes
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0);
    }

    if (acceptanceDecision === "NO" && reasonCodes.length === 0) {
      reasonCodes = ["ACCEPTANCE_GATE_FAILED"];
      reasonMessage = "Automated acceptance gate failed before reason codes were generated.";
    }
  } else {
    reasonMessage = "No deployment required for this release candidate.";
    if (deploySkipReasonCode === "DOCS_ONLY_CHANGE") {
      reasonMessage = "Docs-only release candidate; deployment not required.";
    } else if (deploySkipReasonCode === "CHECKS_ONLY_CHANGE") {
      reasonMessage = "Checks-only release candidate; deployment not required.";
    } else if (deploySkipReasonCode === "DESKTOP_ONLY_CHANGE") {
      reasonMessage = "Desktop-only change; cloud deployment pipeline not required.";
    }

    reasonCodes = [deploySkipReasonCode];
  }

  const existingReasons = Array.isArray(existingResult?.reasons)
    ? existingResult.reasons
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0)
    : [];
  const mergedReasons =
    existingReasons.length > 0 ? existingReasons : reasonMessage ? [reasonMessage] : [];

  await writeJsonFile(resultPath, {
    ...existingResult,
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    deploymentRequired,
    decision: acceptanceDecision,
    pass: acceptanceDecision === "YES",
    reasonCodes,
    reasons: mergedReasons
  });

  await appendGithubOutput({
    acceptance_decision: acceptanceDecision,
    reason_codes_json: JSON.stringify(reasonCodes)
  });
}

void main();
