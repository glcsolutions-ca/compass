import path from "node:path";
import {
  appendGithubOutput,
  evaluateDocsDrift,
  loadMergePolicy,
  parseJsonEnv,
  requireEnv,
  writeJsonFile
} from "./utils.mjs";

async function main() {
  const policyPath =
    process.env.MERGE_POLICY_PATH ?? path.join(".github", "policy", "merge-policy.json");
  const headSha = requireEnv("HEAD_SHA");
  const tier = process.env.RISK_TIER?.trim() || "low";

  const changedFiles = parseJsonEnv("CHANGED_FILES_JSON", []);
  if (!Array.isArray(changedFiles)) {
    throw new Error("CHANGED_FILES_JSON must be a JSON array of file paths");
  }

  const policy = await loadMergePolicy(policyPath);
  const drift = evaluateDocsDrift(policy, changedFiles);
  const status = drift.shouldBlock ? "fail" : "pass";

  const resultPath = path.join(".artifacts", "docs-drift", headSha, "result.json");
  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    tier,
    status,
    ...drift
  };

  await writeJsonFile(resultPath, payload);

  await appendGithubOutput({
    docs_drift_path: resultPath,
    docs_drift_status: status
  });

  if (drift.shouldBlock) {
    console.error("Docs drift blocking: docs-critical paths changed without docTargets updates.");
    process.exit(1);
  }

  console.info(`Docs drift passed (${resultPath})`);
}

void main();
