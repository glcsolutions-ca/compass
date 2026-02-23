import path from "node:path";
import { evaluateRequiredCheckResults } from "./gate-lib.mjs";
import {
  appendGithubOutput,
  fileExists,
  readJsonFile,
  requireEnv,
  writeJsonFile
} from "./utils.mjs";

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

function parseStringArray(name, raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON array`);
  }

  for (const value of parsed) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${name} must contain non-empty strings`);
    }
  }

  return parsed.map((value) => value.trim());
}

function parseRequiredFlowIds() {
  const raw = process.env.REQUIRED_FLOW_IDS_JSON;
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  return parseStringArray("REQUIRED_FLOW_IDS_JSON", raw);
}

function appendReason(reasons, code, message) {
  reasons.push({ code, message });
}

function parseCheckResults() {
  const raw = requireEnv("CHECK_RESULTS_JSON");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CHECK_RESULTS_JSON must be a JSON object");
  }

  const expectedChecks = [
    "preflight",
    "ci-pipeline",
    "browser-evidence",
    "harness-smoke",
    "migration-image-smoke"
  ];

  const checkResults = {};
  for (const checkName of expectedChecks) {
    const value = parsed[checkName];
    checkResults[checkName] =
      typeof value === "string" && value.trim().length > 0 ? value : "unknown";
  }

  return checkResults;
}

function validateRequiredFlowAssertions(flowId, assertions, reasons) {
  const flowAssertions = assertions.filter(
    (assertion) => typeof assertion?.id === "string" && assertion.id.startsWith(`${flowId}:`)
  );

  if (flowAssertions.length === 0) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_REQUIRED_FLOW_ASSERTIONS_MISSING",
      `browser-evidence missing assertions for required flow ${flowId}`
    );
    return;
  }

  const failed = flowAssertions.filter((assertion) => assertion.pass !== true);
  for (const assertion of failed) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_ASSERTION_FAILED",
      `browser-evidence assertion failed for ${flowId}: ${assertion.id}${
        assertion.details ? ` (${assertion.details})` : ""
      }`
    );
  }
}

async function validateBrowserEvidence({
  browserRequired,
  requiredFlowIds,
  checkResults,
  headSha,
  testedSha,
  tier,
  reasons
}) {
  if (!browserRequired) {
    return;
  }

  if (checkResults["browser-evidence"] !== "success") {
    return;
  }

  if (requiredFlowIds.length === 0) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_REQUIRED_FLOWS_EMPTY",
      "browser-evidence is required but REQUIRED_FLOW_IDS_JSON is empty"
    );
    return;
  }

  const browserManifestPath = process.env.BROWSER_EVIDENCE_MANIFEST_PATH?.trim() ?? "";
  if (browserManifestPath.length === 0) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_MANIFEST_PATH_MISSING",
      "browser-evidence manifest path is missing"
    );
    return;
  }

  if (!(await fileExists(browserManifestPath))) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_ARTIFACT_MISSING",
      `browser-evidence artifact is missing at ${browserManifestPath}`
    );
    return;
  }

  const browserManifest = await readJsonFile(browserManifestPath);
  const expectedEntrypoint = process.env.EXPECTED_ENTRYPOINT?.trim() || "/";
  const expectedAccountIdentity = process.env.EXPECTED_ACCOUNT_IDENTITY?.trim() || "";

  if (browserManifest.headSha !== headSha) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_HEAD_SHA_MISMATCH",
      `browser-evidence headSha mismatch: expected ${headSha}, got ${browserManifest.headSha}`
    );
  }

  if (browserManifest.testedSha !== testedSha) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_TESTED_SHA_MISMATCH",
      `browser-evidence testedSha mismatch: expected ${testedSha}, got ${browserManifest.testedSha}`
    );
  }

  if (browserManifest.tier !== tier) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_TIER_MISMATCH",
      `browser-evidence tier mismatch: expected ${tier}, got ${browserManifest.tier}`
    );
  }

  if (!Array.isArray(browserManifest.flows)) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_MANIFEST_FLOWS_INVALID",
      "browser-evidence manifest flows must be an array"
    );
    return;
  }

  if (!Array.isArray(browserManifest.assertions)) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_MANIFEST_ASSERTIONS_INVALID",
      "browser-evidence manifest assertions must be an array"
    );
    return;
  }

  for (const flowId of requiredFlowIds) {
    const flow = browserManifest.flows.find((value) => value?.id === flowId);

    if (!flow) {
      appendReason(
        reasons,
        "BROWSER_EVIDENCE_REQUIRED_FLOW_MISSING",
        `browser-evidence missing required flow: ${flowId}`
      );
      continue;
    }

    if (flow.status !== "passed") {
      appendReason(
        reasons,
        "BROWSER_EVIDENCE_REQUIRED_FLOW_NOT_PASSED",
        `browser-evidence required flow is not passed: ${flowId} (status=${flow.status})`
      );
    }

    if (flow.entrypoint !== expectedEntrypoint) {
      appendReason(
        reasons,
        "BROWSER_EVIDENCE_ENTRYPOINT_MISMATCH",
        `browser-evidence flow ${flowId} entrypoint mismatch: expected ${expectedEntrypoint}, got ${flow.entrypoint}`
      );
    }

    if (expectedAccountIdentity.length > 0 && flow.accountIdentity !== expectedAccountIdentity) {
      appendReason(
        reasons,
        "BROWSER_EVIDENCE_IDENTITY_MISMATCH",
        `browser-evidence flow ${flowId} identity mismatch: expected ${expectedAccountIdentity}, got ${flow.accountIdentity}`
      );
    }

    validateRequiredFlowAssertions(flowId, browserManifest.assertions, reasons);
  }
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;
  const tier = requireEnv("RISK_TIER");
  const requiredFlowIds = parseRequiredFlowIds();
  const browserRequired = parseBooleanEnv("BROWSER_REQUIRED", false);
  const harnessRequired = parseBooleanEnv("HARNESS_REQUIRED", false);
  const migrationImageRequired = parseBooleanEnv("MIGRATION_IMAGE_REQUIRED", false);
  const docsDriftBlocking = parseBooleanEnv("DOCS_DRIFT_BLOCKING", false);
  const docsDriftStatus = (process.env.DOCS_DRIFT_STATUS?.trim() || "unknown").toLowerCase();

  const checkResults = parseCheckResults();
  const reasons = evaluateRequiredCheckResults({
    checkResults,
    browserRequired,
    harnessRequired,
    migrationImageRequired,
    docsDriftBlocking,
    docsDriftStatus
  });

  try {
    await validateBrowserEvidence({
      browserRequired,
      requiredFlowIds,
      checkResults,
      headSha,
      testedSha,
      tier,
      reasons
    });
  } catch (error) {
    appendReason(
      reasons,
      "BROWSER_EVIDENCE_VALIDATION_ERROR",
      error instanceof Error ? error.message : String(error)
    );
  }

  const gatePath = path.join(".artifacts", "risk-policy-gate", testedSha, "result.json");
  const gatePayload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    testedSha,
    tier,
    browserRequired,
    harnessRequired,
    migrationImageRequired,
    docsDriftBlocking,
    docsDriftStatus,
    requiredFlowIds,
    checkResults,
    pass: reasons.length === 0,
    reasonCodes: reasons.map((reason) => reason.code),
    reasonDetails: reasons,
    reasons: reasons.map((reason) => reason.message)
  };

  await writeJsonFile(gatePath, gatePayload);
  await appendGithubOutput({ gate_path: gatePath, gate_pass: String(reasons.length === 0) });

  if (reasons.length > 0) {
    console.error("risk-policy-gate blocking reasons:");
    for (const reason of reasons) {
      console.error(`- [${reason.code}] ${reason.message}`);
    }
    process.exit(1);
  }

  console.info(`risk-policy-gate passed for head=${headSha} tested=${testedSha}`);
}

void main();
