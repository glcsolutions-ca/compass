import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commitStageWorkflowPath = ".github/workflows/commit-stage.yml";
const mergeQueueGateWorkflowPath = ".github/workflows/merge-queue-gate.yml";
const cloudDeliveryPipelineWorkflowPath = ".github/workflows/cloud-delivery-pipeline.yml";
const cloudDeliveryReplayWorkflowPath = ".github/workflows/cloud-delivery-replay.yml";
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
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);

    const concurrency = extractConcurrencySettings(
      extractJobBlock(workflow, "deploy_release_package")
    );

    expect(concurrency.group).toBe("production-mutation");
    expect(concurrency.cancelInProgress).toBe("false");
  });

  it("uses shared infra apply script and deterministic run-scoped ARM deployment name", () => {
    const productionWorkflow = readUtf8(cloudDeliveryPipelineWorkflowPath);

    expect(productionWorkflow).toContain("node scripts/pipeline/cloud/production/apply-infra.mjs");
  });

  it("keeps production stage deploy-only with no docker build commands", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const deployJob = extractJobBlock(workflow, "deploy_release_package");

    expect(deployJob).not.toContain("docker build");
    expect(deployJob).not.toContain("docker push");
  });

  it("keeps acceptance runtime release-package fidelity contract", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);

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

  it("keeps release package build jobs parallelized by artifact type", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    expect(workflow).toContain("name: build-release-package-api-image");
    expect(workflow).toContain("name: build-release-package-web-image");
    expect(workflow).toContain("name: build-release-package-codex-image");
    expect(workflow).toContain("name: capture-current-runtime-refs");
    expect(workflow).toContain("node scripts/pipeline/shared/freeze-release-package-refs.mjs");
  });

  it("keeps commit stage merge-blocking gate context", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    expect(workflow).toContain("name: commit-stage");
  });

  it("keeps commit stage fast-feedback change-aware for runtime and desktop surfaces", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    const runtimeFastFeedbackJob = extractJobBlock(workflow, "fast_feedback");
    const desktopFastFeedbackJob = extractJobBlock(workflow, "desktop_fast_feedback");

    expect(runtimeFastFeedbackJob).toContain(
      "if: ${{ github.event_name == 'pull_request' && (needs.determine_scope.outputs.runtime_changed == 'true' || needs.determine_scope.outputs.infra_changed == 'true' || needs.determine_scope.outputs.identity_changed == 'true' || needs.determine_scope.outputs.delivery_config_changed == 'true') }}"
    );
    expect(desktopFastFeedbackJob).toContain(
      "if: ${{ github.event_name == 'pull_request' && needs.determine_scope.outputs.desktop_changed == 'true' && needs.determine_scope.outputs.docs_only_changed != 'true' }}"
    );
    expect(desktopFastFeedbackJob).toContain("Run desktop fast feedback suite");
  });

  it("keeps commit-stage workflow on pull_request and merge_group with no push trigger", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("merge_group:");
    expect(workflow).not.toContain("\n  push:");
  });

  it("keeps merge-queue-gate workflow focused on merge_group with PR placeholder context", () => {
    const workflow = readUtf8(mergeQueueGateWorkflowPath);
    expect(workflow).toContain("merge_group:");
    expect(workflow).toContain("pull_request:");
    expect(workflow).not.toContain("\n  push:");
    expect(workflow).toContain("name: merge-queue-gate");
    expect(workflow).toContain("github.event_name == 'merge_group'");
    expect(workflow).toContain("node scripts/pipeline/shared/collect-merge-queue-gate-metrics.mjs");
    expect(workflow).toContain("node scripts/pipeline/commit/decide-merge-queue-gate.mjs");
  });

  it("keeps main cloud delivery workflow as push-only and removes replay branching", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    expect(workflow).toContain("push:");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).not.toContain("workflow_run:");
    expect(workflow).toContain("name: verify-commit-stage-evidence");
    expect(workflow).toContain("node scripts/pipeline/shared/verify-commit-stage-evidence.mjs");
    expect(workflow).toContain("name: verify-merge-queue-gate-evidence");
    expect(workflow).toContain("node scripts/pipeline/shared/verify-merge-queue-gate-evidence.mjs");
    expect(workflow).not.toContain("  fast_feedback:");
    expect(workflow).not.toContain("  candidate_context:");
  });

  it("keeps replay workflow manual-only with release_package_sha input", () => {
    const workflow = readUtf8(cloudDeliveryReplayWorkflowPath);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("release_package_sha:");
    expect(workflow).not.toContain("\n  push:");
    expect(workflow).not.toContain("workflow_run:");
  });

  it("replay workflow resolves source run and reuses existing release package artifact", () => {
    const workflow = readUtf8(cloudDeliveryReplayWorkflowPath);
    expect(workflow).toContain("name: resolve-replay-source");
    expect(workflow).toContain("WORKFLOW_FILE: cloud-delivery-pipeline.yml");
    expect(workflow).toContain(
      "name: release-package-${{ needs.resolve_replay_source.outputs.release_package_sha }}"
    );
    expect(workflow).toContain("run-id: ${{ needs.resolve_replay_source.outputs.source_run_id }}");
    expect(workflow).not.toContain("  build_release_package_api_image:");
    expect(workflow).not.toContain("  build_release_package_web_image:");
  });

  it("loads release package with always guard to avoid skipped-needs false negatives", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const loadReleasePackageJob = extractJobBlock(workflow, "load_release_package");
    expect(loadReleasePackageJob).toContain(
      "if: ${{ always() && needs.publish_release_package.result == 'success' }}"
    );
  });

  it("keeps production deploy path fully automated without a human approval job", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    expect(workflow).not.toContain("name: approve-control-plane");
    expect(workflow).not.toContain("production-control-plane");
    expect(workflow).toContain("environment: production");
    expect(workflow).not.toContain("needs.approve_control_plane.result == 'success'");
  });

  it("runs production only after acceptance YES and deploy-required true", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    expect(workflow).toContain("needs.acceptance_stage.outputs.acceptance_decision == 'YES'");
    expect(workflow).toContain("needs.acceptance_stage.outputs.deploy_required == 'true'");
  });

  it("requires fresh auth canary evidence before production smoke checks", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
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
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
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
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replayWorkflow = readUtf8(cloudDeliveryReplayWorkflowPath);
    const acceptanceStageJob = extractJobBlock(workflow, "acceptance_stage");
    const productionStageJob = extractJobBlock(workflow, "production_stage");
    const replayAcceptanceStageJob = extractJobBlock(replayWorkflow, "acceptance_stage");
    const replayProductionStageJob = extractJobBlock(replayWorkflow, "production_stage");

    expect(acceptanceStageJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(productionStageJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(replayAcceptanceStageJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(replayProductionStageJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
  });

  it("boots workspace before production-stage decision script execution", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
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
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const infraAcceptanceJob = extractJobBlock(workflow, "infra_readonly_acceptance");
    const identityAcceptanceJob = extractJobBlock(workflow, "identity_readonly_acceptance");
    const runtimeApiAcceptanceJob = extractJobBlock(workflow, "runtime_api_system_acceptance");

    expect(infraAcceptanceJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(infraAcceptanceJob).toContain("JOB_REQUIRED:");
    expect(infraAcceptanceJob).toContain("Record not-required infra acceptance");

    expect(identityAcceptanceJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(identityAcceptanceJob).toContain("JOB_REQUIRED:");
    expect(identityAcceptanceJob).toContain("Record not-required identity acceptance");

    expect(runtimeApiAcceptanceJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(runtimeApiAcceptanceJob).toContain("JOB_REQUIRED:");
  });

  it("keeps release decision logic in shared scripts and accepts docs-only non-deploy path", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replayWorkflow = readUtf8(cloudDeliveryReplayWorkflowPath);
    const stageEligibilityScript = readUtf8(stageEligibilityScriptPath);

    expect(workflow).toContain(
      "node scripts/pipeline/shared/collect-cloud-delivery-stage-timing.mjs"
    );
    expect(replayWorkflow).toContain(
      "node scripts/pipeline/shared/collect-cloud-delivery-stage-timing.mjs"
    );
    expect(workflow).toContain("node scripts/pipeline/shared/decide-release-outcome.mjs");
    expect(replayWorkflow).toContain("node scripts/pipeline/shared/decide-release-outcome.mjs");
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
