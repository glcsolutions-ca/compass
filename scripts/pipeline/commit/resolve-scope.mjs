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
  classifyReleaseCandidateKind,
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
  const changeClass = classifyReleaseCandidateKind(scope);
  const docsDrift = evaluateDocsDrift(policy, changedFiles);

  const docsDriftBlocking = docsDrift.shouldBlock;
  const deploymentPipelineConfigChanged = docsDrift.touchesBlockingPaths;
  const requiresInfraConvergence = scope.runtime && scope.infra;
  const requiresMigrations = scope.runtime && scope.migration;

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
    changeClass,
    scope,
    deploymentPipelineConfigChanged,
    requiresInfraConvergence,
    requiresMigrations,
    docsDriftBlocking,
    requiredFlowIds: policy.automatedAcceptanceTestGate.requiredFlowIds
  };

  await writeJsonFile(scopePath, payload);

  await appendGithubOutput({
    scope_path: scopePath,
    base_sha: baseSha,
    head_sha: headSha,
    tested_sha: testedSha,
    pr_number: prNumber ? String(prNumber) : "",
    change_class: changeClass,
    runtime_changed: String(scope.runtime),
    desktop_changed: String(scope.desktop),
    infra_changed: String(scope.infra),
    identity_changed: String(scope.identity),
    migration_changed: String(scope.migration),
    infra_rollout_changed: String(scope.infraRollout),
    docs_only_changed: String(scope.docsOnly),
    deployment_pipeline_config_changed: String(deploymentPipelineConfigChanged),
    requires_infra_convergence: String(requiresInfraConvergence),
    requires_migrations: String(requiresMigrations),
    changed_files_json: JSON.stringify(changedFiles),
    required_flow_ids_json: JSON.stringify(policy.automatedAcceptanceTestGate.requiredFlowIds),
    docs_drift_blocking: String(docsDriftBlocking)
  });

  await appendGithubStepSummary(
    [
      "## Commit Scope",
      `- Base SHA: \`${baseSha}\``,
      `- Head SHA: \`${headSha}\``,
      `- Tested SHA: \`${testedSha}\``,
      `- Change class: \`${changeClass}\``,
      `- Changed files: ${changedFiles.length}`,
      `- Runtime changed: \`${scope.runtime}\``,
      `- Desktop changed: \`${scope.desktop}\``,
      `- Infra changed: \`${scope.infra}\``,
      `- Identity changed: \`${scope.identity}\``,
      `- Docs only: \`${scope.docsOnly}\``,
      `- Deployment pipeline config changed: \`${deploymentPipelineConfigChanged}\``,
      `- Requires infra convergence: \`${requiresInfraConvergence}\``,
      `- Requires migrations: \`${requiresMigrations}\``,
      `- Docs drift blocking: \`${docsDriftBlocking}\``
    ].join("\n")
  );

  console.info(
    `Scope resolved: changeClass=${changeClass}, runtime=${scope.runtime}, desktop=${scope.desktop}, infra=${scope.infra}, identity=${scope.identity}, deploymentPipelineConfigChanged=${deploymentPipelineConfigChanged}`
  );
}

void main();
