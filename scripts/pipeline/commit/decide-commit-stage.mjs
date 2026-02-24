import path from "node:path";
import { evaluateCommitStageResults } from "./decide-commit-stage-lib.mjs";
import { appendGithubOutput, requireEnv, writeJsonFile } from "../shared/pipeline-utils.mjs";

function parseBooleanEnv(name, fallback = false) {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  throw new Error(`${name} must be 'true' or 'false'`);
}

function parseNumberEnv(name) {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number when provided`);
  }

  return value;
}

function parseModeEnv(name, fallback = "observe") {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const mode = raw.trim().toLowerCase();
  if (mode !== "observe" && mode !== "enforce") {
    throw new Error(`${name} must be 'observe' or 'enforce'`);
  }

  return mode;
}

function parseCheckResults() {
  const raw = requireEnv("CHECK_RESULTS_JSON");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CHECK_RESULTS_JSON must be a JSON object");
  }

  const expectedChecks = [
    "determine-scope",
    "fast-feedback",
    "desktop-fast-feedback",
    "infra-static-check",
    "identity-static-check"
  ];

  const checkResults = {};
  for (const checkName of expectedChecks) {
    const value = parsed[checkName];
    checkResults[checkName] =
      typeof value === "string" && value.trim().length > 0 ? value : "unknown";
  }

  return checkResults;
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const runtimeRequired = parseBooleanEnv("RUNTIME_REQUIRED", true);
  const desktopRequired = parseBooleanEnv("DESKTOP_REQUIRED", false);
  const infraRequired = parseBooleanEnv("INFRA_REQUIRED", false);
  const identityRequired = parseBooleanEnv("IDENTITY_REQUIRED", false);
  const docsDriftBlocking = parseBooleanEnv("DOCS_DRIFT_BLOCKING", false);
  const docsDriftStatus = (process.env.DOCS_DRIFT_STATUS?.trim() || "unknown").toLowerCase();
  const commitStageSloMode = parseModeEnv("COMMIT_STAGE_SLO_MODE", "observe");
  const commitStageSloPass = parseBooleanEnv("COMMIT_STAGE_SLO_PASS", true);
  const timeToCommitGateSeconds = parseNumberEnv("TIME_TO_COMMIT_GATE_SECONDS");
  const commitStageSloTargetSeconds = parseNumberEnv("COMMIT_STAGE_SLO_TARGET_SECONDS");

  const checkResults = parseCheckResults();
  const reasons = evaluateCommitStageResults({
    checkResults,
    runtimeRequired,
    desktopRequired,
    infraRequired,
    identityRequired,
    docsDriftBlocking,
    docsDriftStatus,
    commitStageSloMode,
    commitStageSloPass,
    timeToCommitGateSeconds,
    commitStageSloTargetSeconds
  });

  const gatePath = path.join(".artifacts", "commit-stage", testedSha, "result.json");
  const gatePayload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    testedSha,
    runtimeRequired,
    desktopRequired,
    infraRequired,
    identityRequired,
    docsDriftBlocking,
    docsDriftStatus,
    commitStageSlo: {
      mode: commitStageSloMode,
      pass: commitStageSloPass,
      targetSeconds: commitStageSloTargetSeconds,
      observedSeconds: timeToCommitGateSeconds
    },
    checkResults,
    pass: reasons.length === 0,
    reasonCodes: reasons.map((reason) => reason.code),
    reasonDetails: reasons,
    reasons: reasons.map((reason) => reason.message)
  };

  await writeJsonFile(gatePath, gatePayload);
  await appendGithubOutput({ gate_path: gatePath, gate_pass: String(reasons.length === 0) });

  if (reasons.length > 0) {
    console.error("commit-stage blocking reasons:");
    for (const reason of reasons) {
      console.error(`- [${reason.code}] ${reason.message}`);
    }
    process.exit(1);
  }

  console.info(`commit-stage passed for head=${headSha} tested=${testedSha}`);
}

void main();
