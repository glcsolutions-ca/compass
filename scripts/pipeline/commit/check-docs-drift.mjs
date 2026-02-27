import path from "node:path";
import { createCcsError, withCcsGuardrail } from "../shared/ccs-contract.mjs";
import {
  appendGithubOutput,
  evaluateDocsDrift,
  loadPipelinePolicy,
  parseJsonEnv,
  requireEnv,
  writeJsonFile
} from "../shared/pipeline-utils.mjs";

async function main() {
  const policyPath =
    process.env.PIPELINE_POLICY_PATH ?? path.join(".github", "policy", "pipeline-policy.json");
  const headSha = requireEnv("HEAD_SHA");
  const testedSha = process.env.TESTED_SHA?.trim() || headSha;

  const changedFiles = parseJsonEnv("CHANGED_FILES_JSON", []);
  if (!Array.isArray(changedFiles)) {
    throw new Error("CHANGED_FILES_JSON must be a JSON array of file paths");
  }

  const policy = await loadPipelinePolicy(policyPath);
  const drift = evaluateDocsDrift(policy, changedFiles);
  const status = drift.shouldBlock ? "fail" : "pass";
  const reasons = drift.reasonCodes.map((code) => {
    if (code === "DOCS_DRIFT_BLOCKING_DOC_TARGET_MISSING") {
      return {
        code,
        blocking: true,
        message:
          "Docs-critical paths changed without matching updates in configured docs target paths."
      };
    }

    if (code === "DOCS_DRIFT_ADVISORY_DOC_TARGET_MISSING") {
      return {
        code,
        blocking: false,
        message:
          "Control-plane paths changed without matching docs target updates. This is advisory for this diff."
      };
    }

    return {
      code,
      blocking: false,
      message: "Docs drift policy reported an unspecified reason code."
    };
  });

  const resultPath = path.join(".artifacts", "docs-drift", testedSha, "result.json");
  const payload = {
    schemaVersion: "1",
    ccsVersion: "1",
    guardrailId: "docs.drift",
    generatedAt: new Date().toISOString(),
    headSha,
    testedSha,
    status,
    reasonCodes: drift.reasonCodes,
    reasons,
    ...drift
  };

  await writeJsonFile(resultPath, payload);

  await appendGithubOutput({
    docs_drift_path: resultPath,
    docs_drift_status: status,
    docs_drift_blocking: String(drift.shouldBlock)
  });

  if (drift.shouldBlock) {
    console.error(
      [
        "DOCS_DRIFT_BLOCKING_DOC_TARGET_MISSING",
        "Docs drift blocking: docs-critical paths changed without docTargets updates.",
        `Docs-critical changed paths: ${drift.docsCriticalPathsChanged.join(", ") || "(none)"}`,
        `Docs target updates found: ${drift.touchedDocTargets.join(", ") || "(none)"}`,
        `Expected docs target globs: ${drift.expectedDocTargets.join(", ")}`
      ].join("\n")
    );
    throw createCcsError({
      code: "DOCS_DRIFT_BLOCKING_DOC_TARGET_MISSING",
      why: "Docs-critical paths changed without required docs target updates.",
      fix: "Update docs targets to match docs-critical changes.",
      doCommands: ["pnpm ci:docs-drift", "pnpm test:quick"],
      ref: "docs/commit-stage-policy.md#docs-drift"
    });
  }

  if (drift.reasonCodes.length > 0) {
    console.info(
      [
        "Docs drift advisory:",
        `Reason codes: ${drift.reasonCodes.join(", ")}`,
        `Blocking-path changes: ${drift.blockingPathsChanged.join(", ") || "(none)"}`,
        `Docs target updates found: ${drift.touchedDocTargets.join(", ") || "(none)"}`,
        `Expected docs target globs: ${drift.expectedDocTargets.join(", ")}`
      ].join("\n")
    );
  }

  console.info(`Docs drift passed (${resultPath})`);
  return {
    status: "pass",
    code: drift.reasonCodes.length > 0 ? drift.reasonCodes[0] : "DOCS_DRIFT_PASS"
  };
}

void withCcsGuardrail({
  guardrailId: "docs.drift",
  command: "pnpm ci:docs-drift",
  passCode: "DOCS_DRIFT_PASS",
  passRef: "docs/commit-stage-policy.md#docs-drift",
  run: main,
  mapError: (error) => ({
    code: "CCS_UNEXPECTED_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve docs-drift runtime input/configuration errors.",
    doCommands: ["pnpm ci:docs-drift"],
    ref: "docs/ccs.md#output-format"
  })
});
