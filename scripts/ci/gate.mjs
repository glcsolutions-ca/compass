import path from "node:path";
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

function parseCheckResults() {
  const raw = requireEnv("CHECK_RESULTS_JSON");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CHECK_RESULTS_JSON must be a JSON object");
  }

  const expectedChecks = ["preflight", "ci-pipeline", "browser-evidence", "harness-smoke"];

  const checkResults = {};
  for (const checkName of expectedChecks) {
    const value = parsed[checkName];
    checkResults[checkName] =
      typeof value === "string" && value.trim().length > 0 ? value : "unknown";
  }

  return checkResults;
}

function validateRequiredResults(
  { checkResults, browserRequired, harnessRequired, docsDriftBlocking, docsDriftStatus },
  reasons
) {
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
}

function validateRequiredFlowAssertions(flowId, assertions, reasons) {
  const flowAssertions = assertions.filter(
    (assertion) => typeof assertion?.id === "string" && assertion.id.startsWith(`${flowId}:`)
  );

  if (flowAssertions.length === 0) {
    reasons.push(`browser-evidence missing assertions for required flow ${flowId}`);
    return;
  }

  const failed = flowAssertions.filter((assertion) => assertion.pass !== true);
  for (const assertion of failed) {
    reasons.push(
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
    reasons.push("browser-evidence is required but REQUIRED_FLOW_IDS_JSON is empty");
    return;
  }

  const browserManifestPath = process.env.BROWSER_EVIDENCE_MANIFEST_PATH?.trim() ?? "";
  if (browserManifestPath.length === 0) {
    reasons.push("browser-evidence manifest path is missing");
    return;
  }

  if (!(await fileExists(browserManifestPath))) {
    reasons.push(`browser-evidence artifact is missing at ${browserManifestPath}`);
    return;
  }

  const browserManifest = await readJsonFile(browserManifestPath);
  const expectedEntrypoint = process.env.EXPECTED_ENTRYPOINT?.trim() || "/";
  const expectedAccountIdentity = process.env.EXPECTED_ACCOUNT_IDENTITY?.trim() || "";

  if (browserManifest.headSha !== headSha) {
    reasons.push(
      `browser-evidence headSha mismatch: expected ${headSha}, got ${browserManifest.headSha}`
    );
  }

  if (browserManifest.testedSha !== testedSha) {
    reasons.push(
      `browser-evidence testedSha mismatch: expected ${testedSha}, got ${browserManifest.testedSha}`
    );
  }

  if (browserManifest.tier !== tier) {
    reasons.push(`browser-evidence tier mismatch: expected ${tier}, got ${browserManifest.tier}`);
  }

  if (!Array.isArray(browserManifest.flows)) {
    reasons.push("browser-evidence manifest flows must be an array");
    return;
  }

  if (!Array.isArray(browserManifest.assertions)) {
    reasons.push("browser-evidence manifest assertions must be an array");
    return;
  }

  for (const flowId of requiredFlowIds) {
    const flow = browserManifest.flows.find((value) => value?.id === flowId);

    if (!flow) {
      reasons.push(`browser-evidence missing required flow: ${flowId}`);
      continue;
    }

    if (flow.status !== "passed") {
      reasons.push(
        `browser-evidence required flow is not passed: ${flowId} (status=${flow.status})`
      );
    }

    if (flow.entrypoint !== expectedEntrypoint) {
      reasons.push(
        `browser-evidence flow ${flowId} entrypoint mismatch: expected ${expectedEntrypoint}, got ${flow.entrypoint}`
      );
    }

    if (expectedAccountIdentity.length > 0 && flow.accountIdentity !== expectedAccountIdentity) {
      reasons.push(
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
  const docsDriftBlocking = parseBooleanEnv("DOCS_DRIFT_BLOCKING", false);
  const docsDriftStatus = (process.env.DOCS_DRIFT_STATUS?.trim() || "unknown").toLowerCase();

  const checkResults = parseCheckResults();
  const reasons = [];

  validateRequiredResults(
    {
      checkResults,
      browserRequired,
      harnessRequired,
      docsDriftBlocking,
      docsDriftStatus
    },
    reasons
  );

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
    reasons.push(error instanceof Error ? error.message : String(error));
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
    docsDriftBlocking,
    docsDriftStatus,
    requiredFlowIds,
    checkResults,
    pass: reasons.length === 0,
    reasons
  };

  await writeJsonFile(gatePath, gatePayload);
  await appendGithubOutput({ gate_path: gatePath, gate_pass: String(reasons.length === 0) });

  if (reasons.length > 0) {
    console.error("risk-policy-gate blocking reasons:");
    for (const reason of reasons) {
      console.error(`- ${reason}`);
    }
    process.exit(1);
  }

  console.info(`risk-policy-gate passed for head=${headSha} tested=${testedSha}`);
}

void main();
