import path from "node:path";
import {
  appendGithubOutput,
  appendGithubStepSummary,
  computeRequiredChecks,
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

  return { baseSha, headSha };
}

async function main() {
  const policyPath =
    process.env.MERGE_POLICY_PATH ?? path.join(".github", "policy", "merge-policy.json");
  const { baseSha, headSha } = await resolveShas();

  const policy = await loadMergePolicy(policyPath);
  const changedFiles = await getChangedFiles(baseSha, headSha);
  const tier = resolveRiskTier(policy, changedFiles);
  const requiredChecks = computeRequiredChecks(policy, tier, changedFiles);

  const browserEvidenceRequired = requiredChecks.includes("browser-evidence");
  const harnessSmokeRequired = requiredChecks.includes("harness-smoke");
  const codexReviewRequired = requiredChecks.includes("codex-review");
  const codexReviewEnabled = policy.reviewPolicy.codexReviewEnabled;
  const ciMode = tier === "t0" ? "fast" : "full";

  const preflightPath = path.join(".artifacts", "merge", headSha, "preflight.json");
  const prNumber = await getPrNumberFromEvent();

  const payload = {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    policyPath,
    baseSha,
    headSha,
    prNumber,
    changedFiles,
    tier,
    requiredChecks,
    ciMode,
    browserEvidenceRequired,
    harnessSmokeRequired,
    codexReviewRequired,
    codexReviewEnabled,
    requiredFlowIds: policy.uiEvidenceRules.requiredFlowIds
  };

  await writeJsonFile(preflightPath, payload);

  await appendGithubOutput({
    preflight_path: preflightPath,
    base_sha: baseSha,
    head_sha: headSha,
    pr_number: prNumber ? String(prNumber) : "",
    tier,
    required_checks_json: JSON.stringify(requiredChecks),
    ci_mode: ciMode,
    changed_files_json: JSON.stringify(changedFiles),
    required_flow_ids_json: JSON.stringify(policy.uiEvidenceRules.requiredFlowIds),
    browser_evidence_required: String(browserEvidenceRequired),
    harness_smoke_required: String(harnessSmokeRequired),
    codex_review_required: String(codexReviewRequired),
    codex_review_enabled: String(codexReviewEnabled)
  });

  await appendGithubStepSummary(
    [
      "## Preflight",
      `- Base SHA: \`${baseSha}\``,
      `- Head SHA: \`${headSha}\``,
      `- Tier: \`${tier}\``,
      `- Changed files: ${changedFiles.length}`,
      `- CI mode: \`${ciMode}\``,
      `- Required checks: ${requiredChecks.map((name) => `\`${name}\``).join(", ")}`,
      `- Browser evidence required: \`${browserEvidenceRequired}\``,
      `- Harness smoke required: \`${harnessSmokeRequired}\``,
      `- Codex review enabled: \`${codexReviewEnabled}\``
    ].join("\n")
  );

  console.info(
    `Preflight complete: tier=${tier}, ciMode=${ciMode}, requiredChecks=${requiredChecks.join(",")}`
  );
}

void main();
