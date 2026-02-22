import path from "node:path";
import {
  appendGithubOutput,
  fileExists,
  readJsonFile,
  requireEnv,
  writeJsonFile
} from "./utils.mjs";

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

function parseRequiredChecks() {
  return parseStringArray("REQUIRED_CHECKS_JSON", requireEnv("REQUIRED_CHECKS_JSON"));
}

function parseRequiredFlowIds() {
  const raw = process.env.REQUIRED_FLOW_IDS_JSON;
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  return parseStringArray("REQUIRED_FLOW_IDS_JSON", raw);
}

function collectCheckResults() {
  return {
    preflight: process.env.CHECK_PREFLIGHT_RESULT ?? "unknown",
    "codex-review": process.env.CHECK_CODEX_REVIEW_RESULT ?? "unknown",
    "ci-pipeline": process.env.CHECK_CI_PIPELINE_RESULT ?? "unknown",
    "browser-evidence": process.env.CHECK_BROWSER_EVIDENCE_RESULT ?? "unknown",
    "harness-smoke": process.env.CHECK_HARNESS_SMOKE_RESULT ?? "unknown"
  };
}

function validateRequiredCheckResults(requiredChecks, checkResults, reasons) {
  if (checkResults.preflight !== "success") {
    reasons.push(`preflight result is ${checkResults.preflight}`);
  }

  const checkToJobResult = {
    "ci-pipeline": checkResults["ci-pipeline"],
    "browser-evidence": checkResults["browser-evidence"],
    "harness-smoke": checkResults["harness-smoke"],
    "codex-review": checkResults["codex-review"]
  };

  for (const checkName of requiredChecks) {
    if (checkName === "risk-policy-gate") {
      continue;
    }

    const result = checkToJobResult[checkName];
    if (!result) {
      reasons.push(`No job result mapping found for required check ${checkName}`);
      continue;
    }

    if (result !== "success") {
      reasons.push(`Required check ${checkName} did not succeed (result=${result})`);
    }
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
  requiredChecks,
  requiredFlowIds,
  checkResults,
  headSha,
  tier,
  reasons
}) {
  if (!requiredChecks.includes("browser-evidence")) {
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
  const tier = requireEnv("RISK_TIER");
  const requiredChecks = parseRequiredChecks();
  const requiredFlowIds = parseRequiredFlowIds();

  const checkResults = collectCheckResults();
  const reasons = [];

  validateRequiredCheckResults(requiredChecks, checkResults, reasons);

  try {
    await validateBrowserEvidence({
      requiredChecks,
      requiredFlowIds,
      checkResults,
      headSha,
      tier,
      reasons
    });
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }

  const gatePath = path.join(".artifacts", "risk-policy-gate", headSha, "result.json");
  const gatePayload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    tier,
    requiredChecks,
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

  console.info(`risk-policy-gate passed for ${headSha}`);
}

void main();
