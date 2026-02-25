import path from "node:path";
import { evaluateAcceptanceStageResults } from "./decide-automated-acceptance-test-gate-lib.mjs";
import { appendGithubOutput, requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";

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

function parseJsonArrayEnv(name) {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON array when provided`);
  }

  return parsed.map((value) => String(value));
}

function parseCheckResults() {
  const raw = requireEnv("CHECK_RESULTS_JSON");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CHECK_RESULTS_JSON must be a JSON object");
  }

  const expectedChecks = [
    "load-release-candidate",
    "runtime-api-system-acceptance",
    "runtime-browser-acceptance",
    "runtime-migration-image-acceptance",
    "infra-readonly-acceptance",
    "identity-readonly-acceptance"
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
  const runtimeRequired = parseBooleanEnv("RUNTIME_REQUIRED", false);
  const infraRequired = parseBooleanEnv("INFRA_REQUIRED", false);
  const identityRequired = parseBooleanEnv("IDENTITY_REQUIRED", false);
  const releaseCandidateRefContractStatus =
    process.env.RELEASE_CANDIDATE_REF_CONTRACT_STATUS?.trim().toLowerCase() || "unknown";
  const releaseCandidateRefContractReasonCodes = parseJsonArrayEnv(
    "RELEASE_CANDIDATE_REF_CONTRACT_REASON_CODES_JSON"
  );
  const identityConfigContractStatus =
    process.env.IDENTITY_CONFIG_CONTRACT_STATUS?.trim().toLowerCase() || "unknown";
  const identityConfigContractReasonCodes = parseJsonArrayEnv(
    "IDENTITY_CONFIG_CONTRACT_REASON_CODES_JSON"
  );

  const checkResults = parseCheckResults();
  const reasons = evaluateAcceptanceStageResults({
    checkResults,
    runtimeRequired,
    infraRequired,
    identityRequired,
    releaseCandidateRefContractStatus,
    releaseCandidateRefContractReasonCodes,
    identityConfigContractStatus,
    identityConfigContractReasonCodes
  });

  const resultPath = path.join(
    ".artifacts",
    "automated-acceptance-test-gate",
    headSha,
    "result.json"
  );
  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    runtimeRequired,
    infraRequired,
    identityRequired,
    releaseCandidateRefContractStatus,
    releaseCandidateRefContractReasonCodes,
    identityConfigContractStatus,
    identityConfigContractReasonCodes,
    checkResults,
    pass: reasons.length === 0,
    reasonCodes: reasons.map((reason) => reason.code),
    reasonDetails: reasons,
    reasons: reasons.map((reason) => reason.message)
  };

  await writeJsonFile(resultPath, payload);
  await appendGithubOutput({
    acceptance_result_path: resultPath,
    acceptance_pass: String(reasons.length === 0)
  });

  if (reasons.length > 0) {
    console.error("automated-acceptance-test-gate blocking reasons:");
    for (const reason of reasons) {
      console.error(`- [${reason.code}] ${reason.message}`);
    }
    process.exit(1);
  }

  console.info(`automated-acceptance-test-gate passed for ${headSha}`);
}

void main();
