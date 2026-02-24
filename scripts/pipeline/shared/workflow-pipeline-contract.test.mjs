import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commitStageWorkflowPath = ".github/workflows/commit-stage.yml";
const cloudDeploymentPipelineWorkflowPath = ".github/workflows/cloud-deployment-pipeline.yml";
const desktopDeploymentPipelineWorkflowPath = ".github/workflows/desktop-deployment-pipeline.yml";
const desktopReleaseCompatibilityWorkflowPath = ".github/workflows/desktop-release.yml";
const authCanaryWorkflowPath = ".github/workflows/auth-entra-canary.yml";
const authDelegatedWorkflowPath = ".github/workflows/auth-delegated-smoke.yml";
const sharedApplyScriptPath = "scripts/pipeline/cloud/production/apply-infra.mjs";
const stageEligibilityScriptPath = "scripts/pipeline/shared/resolve-stage-eligibility.mjs";

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8");
}

function extractJobBlock(content, jobName) {
  const lines = content.split("\n");
  const startIndex = lines.findIndex((line) => line.startsWith(`  ${jobName}:`));

  if (startIndex === -1) {
    throw new Error(`Could not find job '${jobName}'`);
  }

  const blockLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  [A-Za-z0-9_-]+:/.test(line)) {
      break;
    }
    blockLines.push(line);
  }

  return blockLines.join("\n");
}

function extractConcurrencySettings(jobBlock) {
  const match = jobBlock.match(
    /^\s{4}concurrency:\n\s{6}group:\s*(.+)\n\s{6}cancel-in-progress:\s*(.+)$/m
  );

  if (!match) {
    throw new Error("Could not find job-level concurrency settings");
  }

  const group = match[1].trim().replace(/^['"]|['"]$/g, "");
  const cancelInProgress = match[2].trim().replace(/^['"]|['"]$/g, "");

  return {
    group,
    cancelInProgress
  };
}

describe("workflow pipeline contract", () => {
  it("keeps production mutation under a serialized lock with cancel disabled", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);

    const concurrency = extractConcurrencySettings(
      extractJobBlock(workflow, "deploy_approved_candidate")
    );

    expect(concurrency.group).toBe("production-mutation");
    expect(concurrency.cancelInProgress).toBe("false");
  });

  it("uses shared infra apply script and deterministic run-scoped ARM deployment name", () => {
    const productionWorkflow = readUtf8(cloudDeploymentPipelineWorkflowPath);

    expect(productionWorkflow).toContain("node scripts/pipeline/cloud/production/apply-infra.mjs");
  });

  it("keeps production stage deploy-only with no docker build commands", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const deployJob = extractJobBlock(workflow, "deploy_approved_candidate");

    expect(deployJob).not.toContain("docker build");
    expect(deployJob).not.toContain("docker push");
  });

  it("keeps acceptance runtime candidate-fidelity contract", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);

    expect(workflow).toContain("name: runtime-api-system-acceptance");
    expect(workflow).toContain("name: runtime-browser-acceptance");
    expect(workflow).toContain("name: runtime-migration-image-acceptance");
    expect(workflow).toContain(
      "node scripts/pipeline/cloud/acceptance/run-runtime-api-system-acceptance.mjs"
    );
    expect(workflow).toContain(
      "node scripts/pipeline/cloud/acceptance/run-runtime-browser-acceptance.mjs"
    );
    expect(workflow).toContain(
      "node scripts/pipeline/cloud/acceptance/run-runtime-migration-image-acceptance.mjs"
    );
  });

  it("keeps candidate freeze jobs parallelized by artifact type", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    expect(workflow).toContain("name: freeze-candidate-api-image");
    expect(workflow).toContain("name: freeze-candidate-web-image");
    expect(workflow).toContain("name: freeze-current-runtime-refs");
    expect(workflow).toContain("node scripts/pipeline/shared/freeze-release-candidate-refs.mjs");
  });

  it("keeps commit stage merge-blocking gate context", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    expect(workflow).toContain("name: commit-stage");
  });

  it("keeps commit stage fast-feedback change-aware for runtime and desktop surfaces", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    const runtimeFastFeedbackJob = extractJobBlock(workflow, "fast_feedback");
    const desktopFastFeedbackJob = extractJobBlock(workflow, "desktop_fast_feedback");
    const deploymentWorkflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const deploymentFastFeedbackJob = extractJobBlock(deploymentWorkflow, "fast_feedback");

    expect(runtimeFastFeedbackJob).toContain(
      "if: ${{ needs.determine_scope.outputs.runtime_changed == 'true' || needs.determine_scope.outputs.infra_changed == 'true' || needs.determine_scope.outputs.identity_changed == 'true' || needs.determine_scope.outputs.control_plane_changed == 'true' }}"
    );
    expect(desktopFastFeedbackJob).toContain(
      "if: ${{ needs.determine_scope.outputs.desktop_changed == 'true' && needs.determine_scope.outputs.docs_only_changed != 'true' }}"
    );
    expect(desktopFastFeedbackJob).toContain("Run desktop fast feedback suite");
    expect(deploymentFastFeedbackJob).toContain(
      "if: ${{ needs.candidate_context.outputs.replay_mode != 'true' && (needs.determine_scope.outputs.runtime_changed == 'true' || needs.determine_scope.outputs.infra_changed == 'true' || needs.determine_scope.outputs.identity_changed == 'true' || needs.determine_scope.outputs.control_plane_changed == 'true') }}"
    );
  });

  it("keeps commit-stage workflow as PR and merge queue only", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("merge_group:");
    expect(workflow).not.toContain("\n  push:");
  });

  it("keeps deployment pipeline as push/dispatch and removes cross-workflow chaining", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    expect(workflow).toContain("push:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("workflow_run:");
  });

  it("loads release candidate with always guard to avoid skipped-needs false negatives", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const loadCandidateJob = extractJobBlock(workflow, "load_release_candidate");
    expect(loadCandidateJob).toContain(
      "if: ${{ always() && (needs.candidate_context.outputs.replay_mode == 'true' || needs.publish_release_candidate.result == 'success') }}"
    );
  });

  it("keeps control-plane approval gate for infra and identity scopes", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    expect(workflow).toContain("name: approve-control-plane");
    expect(workflow).toContain(
      "environment: ${{ needs.acceptance_stage.outputs.control_plane_required == 'true' && 'production-control-plane' || 'acceptance' }}"
    );
    expect(workflow).toContain(
      "if: ${{ needs.acceptance_stage.outputs.acceptance_decision == 'YES' && needs.acceptance_stage.outputs.deploy_required == 'true' }}"
    );
    expect(workflow).toContain("needs.acceptance_stage.outputs.control_plane_required == 'true'");
    expect(workflow).toContain("needs.approve_control_plane.result == 'success'");
  });

  it("runs production only after acceptance YES and deploy-required true", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    expect(workflow).toContain("needs.acceptance_stage.outputs.acceptance_decision == 'YES'");
    expect(workflow).toContain("needs.acceptance_stage.outputs.deploy_required == 'true'");
  });

  it("requires fresh auth canary evidence before production smoke checks", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    expect(workflow).toContain("Verify auth canary freshness");
    expect(workflow).toContain("Verify delegated pre-deploy probe freshness");
    expect(workflow).toContain(
      "node scripts/pipeline/cloud/production/verify-auth-canary-freshness.mjs"
    );
    expect(workflow).toContain("AUTH_CANARY_ARTIFACT_NAME: delegated-smoke-freshness");
    expect(workflow).toContain("AUTH_CANARY_REQUIRED_ARTIFACT_NAME: auth-delegated-smoke-");
  });

  it("defines nightly auth entra canary workflow", () => {
    const workflow = readUtf8(authCanaryWorkflowPath);
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("node scripts/pipeline/cloud/acceptance/run-auth-entra-canary.mjs");
  });

  it("defines manual delegated auth smoke workflow", () => {
    const workflow = readUtf8(authDelegatedWorkflowPath);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("AUTH_DELEGATED_PROBE_TOKEN");
    expect(workflow).toContain("node scripts/pipeline/cloud/production/verify-delegated-smoke.mjs");
  });

  it("uses runtime client credentials for production api smoke", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    expect(workflow).toContain("AUTH_AUDIENCE: ${{ vars.AUTH_AUDIENCE }}");
    expect(workflow).toContain("API_SMOKE_ALLOWED_TENANT_ID");
    expect(workflow).toContain("API_SMOKE_ALLOWED_CLIENT_ID");
    expect(workflow).toContain("API_SMOKE_DENIED_TENANT_ID");
    expect(workflow).toContain("API_SMOKE_DENIED_CLIENT_ID");
    expect(workflow).toContain("API_SMOKE_DENIED_EXPECTED_CODE");
    expect(workflow).not.toContain("API_SMOKE_AUTH_TOKEN");
    expect(workflow).not.toContain("API_SMOKE_APP_TOKEN");
  });

  it("keeps acceptance and production result jobs running with always() for deterministic reason codes", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const acceptanceStageJob = extractJobBlock(workflow, "acceptance_stage");
    const productionStageJob = extractJobBlock(workflow, "production_stage");

    expect(acceptanceStageJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
    expect(productionStageJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
  });

  it("boots workspace before production-stage decision script execution", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const productionStageJob = extractJobBlock(workflow, "production_stage");

    expect(productionStageJob).toContain("- name: Checkout");
    expect(productionStageJob).toContain("uses: actions/checkout@v4");
    expect(productionStageJob).toContain("- name: Setup Node");
    expect(productionStageJob).toContain("uses: actions/setup-node@v4");
    expect(productionStageJob).toContain(
      "run: node scripts/pipeline/cloud/production/decide-production-stage.mjs"
    );
  });

  it("keeps required acceptance jobs deterministic via always() and JOB_REQUIRED guards", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const infraAcceptanceJob = extractJobBlock(workflow, "infra_readonly_acceptance");
    const identityAcceptanceJob = extractJobBlock(workflow, "identity_readonly_acceptance");
    const runtimeApiAcceptanceJob = extractJobBlock(workflow, "runtime_api_system_acceptance");

    expect(infraAcceptanceJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
    expect(infraAcceptanceJob).toContain("JOB_REQUIRED:");
    expect(infraAcceptanceJob).toContain("Record not-required infra acceptance");

    expect(identityAcceptanceJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
    expect(identityAcceptanceJob).toContain("JOB_REQUIRED:");
    expect(identityAcceptanceJob).toContain("Record not-required identity acceptance");

    expect(runtimeApiAcceptanceJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
    expect(runtimeApiAcceptanceJob).toContain("JOB_REQUIRED:");
  });

  it("keeps release decision logic in shared script and accepts docs-only non-deploy path", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const stageEligibilityScript = readUtf8(stageEligibilityScriptPath);
    expect(workflow).toContain(
      "node scripts/pipeline/shared/collect-cloud-deployment-stage-timing.mjs"
    );
    expect(workflow).toContain("node scripts/pipeline/shared/decide-release-outcome.mjs");
    expect(stageEligibilityScript).toContain("DOCS_ONLY_CHANGE");
    expect(stageEligibilityScript).toContain("CHECKS_ONLY_CHANGE");
    expect(stageEligibilityScript).toContain("DESKTOP_ONLY_CHANGE");
  });

  it("keeps ARM validate and create commands using explicit --name in shared apply script", () => {
    const script = readUtf8(sharedApplyScriptPath);

    expect(script).toMatch(/["']--name["'],\s*deploymentName/);
    expect(script).toContain('"validate"');
    expect(script).toContain('"create"');
  });

  it("keeps desktop deployable under a dedicated deployment pipeline", () => {
    const workflow = readUtf8(desktopDeploymentPipelineWorkflowPath);
    expect(workflow).toContain("name: Desktop Deployment Pipeline");
    expect(workflow).toContain("desktop-determine-scope");
    expect(workflow).toContain("desktop-fast-feedback");
    expect(workflow).toContain("desktop-commit-stage");
    expect(workflow).toContain("build-signed-macos");
    expect(workflow).toContain("build-signed-windows");
    expect(workflow).toContain("desktop-backend-contract-acceptance");
    expect(workflow).toContain("desktop-acceptance-stage");
    expect(workflow).toContain("publish-desktop-release");
    expect(workflow).toContain("desktop-production-stage");
    expect(workflow).toContain("desktop-release-decision");
    expect(workflow).toContain(".artifacts/desktop-release/");
  });

  it("keeps desktop canonical path signed-only and removes legacy signing mode forks", () => {
    const workflow = readUtf8(desktopDeploymentPipelineWorkflowPath);
    expect(workflow).not.toContain("signing_mode");
    expect(workflow).not.toContain("candidate_validation");
    expect(workflow).toContain("Sign MSI with Azure Artifact Signing");
    expect(workflow).toContain("Verify macOS signing and notarization");
    expect(workflow).toContain(
      "node scripts/pipeline/desktop/acceptance/run-desktop-backend-contract-acceptance.mjs"
    );
  });

  it("keeps desktop-release workflow as manual compatibility lane only", () => {
    const workflow = readUtf8(desktopReleaseCompatibilityWorkflowPath);
    expect(workflow).toContain("name: Desktop Release (Compatibility)");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("\n  push:");
    expect(workflow).not.toContain("signing_mode");
    expect(workflow).not.toContain("candidate_validation");
  });
});
