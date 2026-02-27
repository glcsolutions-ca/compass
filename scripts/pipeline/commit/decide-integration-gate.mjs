import path from "node:path";
import { createCcsError, withCcsGuardrail } from "../shared/ccs-contract.mjs";
import { evaluateIntegrationGateResults } from "./decide-integration-gate-lib.mjs";
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

function parseCheckResults() {
  const raw = requireEnv("CHECK_RESULTS_JSON");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("CHECK_RESULTS_JSON must be a JSON object");
  }

  const expectedChecks = [
    "determine-scope",
    "build-compile",
    "migration-safety",
    "runtime-contract-smoke",
    "minimal-integration-smoke"
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
  const buildRequired = parseBooleanEnv("BUILD_REQUIRED", true);
  const migrationRequired = parseBooleanEnv("MIGRATION_REQUIRED", false);
  const runtimeSmokeRequired = parseBooleanEnv("RUNTIME_SMOKE_REQUIRED", true);
  const integrationRequired = parseBooleanEnv("INTEGRATION_REQUIRED", true);
  const docsDriftBlocking = parseBooleanEnv("DOCS_DRIFT_BLOCKING", false);
  const docsDriftStatus = (process.env.DOCS_DRIFT_STATUS?.trim() || "unknown").toLowerCase();

  const checkResults = parseCheckResults();
  const reasons = evaluateIntegrationGateResults({
    checkResults,
    buildRequired,
    migrationRequired,
    runtimeSmokeRequired,
    integrationRequired,
    docsDriftBlocking,
    docsDriftStatus
  });

  const gatePath = path.join(".artifacts", "integration-gate", testedSha, "result.json");
  const gatePayload = {
    schemaVersion: "1",
    ccsVersion: "1",
    guardrailId: "integration-gate.decision",
    generatedAt: new Date().toISOString(),
    headSha,
    testedSha,
    buildRequired,
    migrationRequired,
    runtimeSmokeRequired,
    integrationRequired,
    docsDriftBlocking,
    docsDriftStatus,
    checkResults,
    pass: reasons.length === 0,
    reasonCodes: reasons.map((reason) => reason.code),
    reasonDetails: reasons,
    reasons: reasons.map((reason) => reason.message)
  };

  await writeJsonFile(gatePath, gatePayload);
  await appendGithubOutput({ gate_path: gatePath, gate_pass: String(reasons.length === 0) });

  if (reasons.length > 0) {
    console.error("integration-gate blocking reasons:");
    for (const reason of reasons) {
      console.error(`- [${reason.code}] ${reason.message}`);
    }
    throw createCcsError({
      code: reasons[0]?.code ?? "INTEGRATION_GATE_BLOCKED",
      why: `Integration gate blocked (${reasons.length} reason(s)).`,
      fix: "All required integration checks must pass.",
      doCommands: [
        'gh run view "$GITHUB_RUN_ID" --log',
        `cat ${gatePath}`,
        "fix forward on main and push a corrective commit"
      ],
      ref: "docs/commit-stage-policy.md#integration-gate-checks"
    });
  }

  console.info(`integration-gate passed for head=${headSha} tested=${testedSha}`);
  return { status: "pass", code: "INTEGRATION_GATE_PASS" };
}

void withCcsGuardrail({
  guardrailId: "integration-gate.decision",
  command: "node scripts/pipeline/commit/decide-integration-gate.mjs",
  passCode: "INTEGRATION_GATE_PASS",
  passRef: "docs/commit-stage-policy.md#integration-gate-checks",
  run: main,
  mapError: (error) => ({
    code: "CCS_UNEXPECTED_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve integration-gate decision runtime errors.",
    doCommands: ["node scripts/pipeline/commit/decide-integration-gate.mjs"],
    ref: "docs/ccs.md#output-format"
  })
});
