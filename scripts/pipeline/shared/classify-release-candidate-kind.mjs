import path from "node:path";
import { withCcsGuardrail } from "./ccs-contract.mjs";
import {
  appendGithubOutput,
  classifyReleaseCandidateKind,
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
  const changeClass = classifyReleaseCandidateKind(scope);
  const requiresInfraConvergence = scope.runtime && scope.infra;
  const requiresMigrations = scope.runtime && scope.migration;

  await appendGithubOutput({
    base_sha: baseSha,
    change_class: changeClass,
    runtime_changed: String(scope.runtime),
    infra_changed: String(scope.infra),
    identity_changed: String(scope.identity),
    docs_only_changed: String(scope.docsOnly),
    requires_infra_convergence: String(requiresInfraConvergence),
    requires_migrations: String(requiresMigrations),
    rollout: String(scope.infraRollout),
    changed_files_json: JSON.stringify(changedFiles)
  });

  console.info(
    `release-candidate-kind: changeClass=${changeClass} runtime=${scope.runtime} infra=${scope.infra} identity=${scope.identity} docsOnly=${scope.docsOnly} changed=${changedFiles.length}`
  );
  return { status: "pass", code: "RCCLASS000" };
}

void withCcsGuardrail({
  guardrailId: "release-candidate.classify",
  command: "node scripts/pipeline/shared/classify-release-candidate-kind.mjs",
  passCode: "RCCLASS000",
  passRef: "docs/commit-stage-policy.md",
  run: main,
  mapError: (error) => ({
    code: "RCCLASS001",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve release-candidate classification inputs and rerun.",
    doCommands: ["node scripts/pipeline/shared/classify-release-candidate-kind.mjs"],
    ref: "docs/commit-stage-policy.md"
  })
});
