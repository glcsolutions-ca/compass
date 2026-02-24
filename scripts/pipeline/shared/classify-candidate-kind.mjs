import path from "node:path";
import {
  appendGithubOutput,
  classifyCandidateKind,
  getChangedFiles,
  getCurrentSha,
  getParentSha,
  loadPipelinePolicy,
  resolveChangeScope
} from "./pipeline-utils.mjs";

async function main() {
  const policyPath =
    process.env.PIPELINE_POLICY_PATH ?? path.join(".github", "policy", "pipeline-policy.json");
  const headSha = process.env.HEAD_SHA?.trim() || (await getCurrentSha());
  let baseSha = process.env.BASE_SHA?.trim();

  if (!baseSha || baseSha === "0000000000000000000000000000000000000000") {
    baseSha = await getParentSha(headSha);
  }

  const policy = await loadPipelinePolicy(policyPath);
  const changedFiles = await getChangedFiles(baseSha, headSha);
  const scope = resolveChangeScope(policy, changedFiles);
  const kind = classifyCandidateKind(scope);
  const needsInfra = scope.runtime && scope.infra;
  const needsMigrations = scope.runtime && scope.migration;

  await appendGithubOutput({
    base_sha: baseSha,
    kind,
    runtime_changed: String(scope.runtime),
    infra_changed: String(scope.infra),
    identity_changed: String(scope.identity),
    docs_only_changed: String(scope.docsOnly),
    needs_infra: String(needsInfra),
    needs_migrations: String(needsMigrations),
    rollout: String(scope.infraRollout),
    changed_files_json: JSON.stringify(changedFiles)
  });

  console.info(
    `candidate-kind: kind=${kind} runtime=${scope.runtime} infra=${scope.infra} identity=${scope.identity} docsOnly=${scope.docsOnly} changed=${changedFiles.length}`
  );
}

void main();
