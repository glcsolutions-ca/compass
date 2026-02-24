import path from "node:path";
import {
  appendGithubOutput,
  appendGithubStepSummary,
  evaluateDocsDrift,
  getChangedFiles,
  getCurrentSha,
  getParentSha,
  getPrNumberFromEvent,
  loadPipelinePolicy,
  resolveChangeScope,
  classifyCandidateKind,
  writeJsonFile
} from "../shared/pipeline-utils.mjs";
import { resolveScopeShas } from "./resolve-scope-lib.mjs";

async function main() {
  const policyPath =
    process.env.PIPELINE_POLICY_PATH ?? path.join(".github", "policy", "pipeline-policy.json");
  const { baseSha, headSha, testedSha } = await resolveScopeShas({
    getCurrentSha,
    getParentSha
  });

  const policy = await loadPipelinePolicy(policyPath);
  const changedFiles = await getChangedFiles(baseSha, headSha);
  const scope = resolveChangeScope(policy, changedFiles);
  const kind = classifyCandidateKind(scope);
  const docsDrift = evaluateDocsDrift(policy, changedFiles);

  const docsDriftBlocking = docsDrift.shouldBlock;
  const needsInfra = scope.runtime && scope.infra;
  const needsMigrations = scope.runtime && scope.migration;

  const scopePath = path.join(".artifacts", "commit-stage", testedSha, "scope.json");
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
    kind,
    scope,
    needsInfra,
    needsMigrations,
    docsDriftBlocking,
    requiredFlowIds: policy.acceptanceStage.requiredFlowIds
  };

  await writeJsonFile(scopePath, payload);

  await appendGithubOutput({
    scope_path: scopePath,
    base_sha: baseSha,
    head_sha: headSha,
    tested_sha: testedSha,
    pr_number: prNumber ? String(prNumber) : "",
    kind,
    runtime_changed: String(scope.runtime),
    infra_changed: String(scope.infra),
    identity_changed: String(scope.identity),
    migration_changed: String(scope.migration),
    infra_rollout_changed: String(scope.infraRollout),
    docs_only_changed: String(scope.docsOnly),
    needs_infra: String(needsInfra),
    needs_migrations: String(needsMigrations),
    changed_files_json: JSON.stringify(changedFiles),
    required_flow_ids_json: JSON.stringify(policy.acceptanceStage.requiredFlowIds),
    docs_drift_blocking: String(docsDriftBlocking)
  });

  await appendGithubStepSummary(
    [
      "## Commit Scope",
      `- Base SHA: \`${baseSha}\``,
      `- Head SHA: \`${headSha}\``,
      `- Tested SHA: \`${testedSha}\``,
      `- Kind: \`${kind}\``,
      `- Changed files: ${changedFiles.length}`,
      `- Runtime changed: \`${scope.runtime}\``,
      `- Infra changed: \`${scope.infra}\``,
      `- Identity changed: \`${scope.identity}\``,
      `- Docs only: \`${scope.docsOnly}\``,
      `- Needs infra convergence: \`${needsInfra}\``,
      `- Needs migrations: \`${needsMigrations}\``,
      `- Docs drift blocking: \`${docsDriftBlocking}\``
    ].join("\n")
  );

  console.info(
    `Scope resolved: kind=${kind}, runtime=${scope.runtime}, infra=${scope.infra}, identity=${scope.identity}`
  );
}

void main();
