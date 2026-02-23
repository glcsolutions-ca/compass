import path from "node:path";
import {
  appendGithubOutput,
  appendGithubStepSummary,
  computeRequiredChecks,
  evaluateDocsDrift,
  getChangedFiles,
  getCurrentSha,
  getParentSha,
  getPrNumberFromEvent,
  loadMergePolicy,
  resolveRiskTier,
  writeJsonFile
} from "./utils.mjs";

async function resolveShas() {
  const headSha = process.env.GITHUB_HEAD_SHA?.trim() || (await getCurrentSha());
  const baseSha = process.env.GITHUB_BASE_SHA?.trim() || (await getParentSha(headSha));
  const testedSha = process.env.GITHUB_TESTED_SHA?.trim() || (await getCurrentSha());

  return { baseSha, headSha, testedSha };
}

async function main() {
  const policyPath =
    process.env.MERGE_POLICY_PATH ?? path.join(".github", "policy", "merge-policy.json");
  const { baseSha, headSha, testedSha } = await resolveShas();

  const policy = await loadMergePolicy(policyPath);
  const changedFiles = await getChangedFiles(baseSha, headSha);
  const tier = resolveRiskTier(policy, changedFiles);
  const requiredChecks = computeRequiredChecks(policy, tier, changedFiles);
  const docsDrift = evaluateDocsDrift(policy, changedFiles);

  const browserRequired = requiredChecks.includes("browser-evidence");
  const harnessRequired = requiredChecks.includes("harness-smoke");
  const docsDriftBlocking = docsDrift.shouldBlock;
  const ciMode = tier === "low" ? "fast" : "full";

  const preflightPath = path.join(".artifacts", "merge", testedSha, "preflight.json");
  const prNumber = await getPrNumberFromEvent();

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    policyPath,
    baseSha,
    headSha,
    testedSha,
    prNumber,
    changedFiles,
    tier,
    requiredChecks,
    ciMode,
    browserRequired,
    harnessRequired,
    docsDriftBlocking,
    requiredFlowIds: policy.uiEvidenceRules.requiredFlowIds
  };

  await writeJsonFile(preflightPath, payload);

  await appendGithubOutput({
    preflight_path: preflightPath,
    base_sha: baseSha,
    head_sha: headSha,
    tested_sha: testedSha,
    pr_number: prNumber ? String(prNumber) : "",
    tier,
    ci_mode: ciMode,
    changed_files_json: JSON.stringify(changedFiles),
    required_flow_ids_json: JSON.stringify(policy.uiEvidenceRules.requiredFlowIds),
    browser_required: String(browserRequired),
    harness_required: String(harnessRequired),
    docs_drift_blocking: String(docsDriftBlocking)
  });

  await appendGithubStepSummary(
    [
      "## Preflight",
      `- Base SHA: \`${baseSha}\``,
      `- Head SHA: \`${headSha}\``,
      `- Tested SHA: \`${testedSha}\``,
      `- Tier: \`${tier}\``,
      `- Changed files: ${changedFiles.length}`,
      `- CI mode: \`${ciMode}\``,
      `- Browser evidence required: \`${browserRequired}\``,
      `- Harness smoke required: \`${harnessRequired}\``,
      `- Docs drift blocking: \`${docsDriftBlocking}\``
    ].join("\n")
  );

  console.info(
    `Preflight complete: tier=${tier}, ciMode=${ciMode}, requiredChecks=${requiredChecks.join(",")}`
  );
}

void main();
