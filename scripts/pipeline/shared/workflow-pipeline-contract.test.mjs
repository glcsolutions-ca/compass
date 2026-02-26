import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commitStageWorkflowPath = ".github/workflows/commit-stage.yml";
const integrationGateWorkflowPath = ".github/workflows/integration-gate.yml";
const cloudDeploymentPipelineWorkflowPath = ".github/workflows/cloud-deployment-pipeline.yml";
const cloudDeploymentPipelineReplayWorkflowPath =
  ".github/workflows/cloud-deployment-pipeline-replay.yml";
const mainRedRecoveryWorkflowPath = ".github/workflows/main-red-recovery.yml";
const sharedApplyScriptPath = "scripts/pipeline/cloud/deployment-stage/apply-infra.mjs";
const legacyMergeGroupToken = ["merge", "group"].join("_");

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

  return {
    group: match[1].trim().replace(/^['"]|['"]$/g, ""),
    cancelInProgress: match[2].trim().replace(/^['"]|['"]$/g, "")
  };
}

describe("workflow pipeline contract", () => {
  it("keeps commit and integration-gate checks as explicit mainline gates", () => {
    const commitStage = readUtf8(commitStageWorkflowPath);
    const integrationGate = readUtf8(integrationGateWorkflowPath);

    expect(commitStage).toContain("name: commit-stage");
    expect(commitStage).toContain("push:");
    expect(commitStage).toContain("- main");
    expect(commitStage).toContain("pull_request:");
    expect(commitStage).not.toContain(`${legacyMergeGroupToken}:`);

    expect(integrationGate).toContain("name: integration-gate");
    expect(integrationGate).toContain("push:");
    expect(integrationGate).toContain("- main");
    expect(integrationGate).toContain("pull_request:");
    expect(integrationGate).not.toContain(`${legacyMergeGroupToken}:`);
  });

  it("keeps cloud deployment pipeline workflow push-only and replay workflow manual-only", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    expect(delivery).toContain("push:");
    expect(delivery).not.toContain("workflow_dispatch:");

    expect(replay).toContain("workflow_dispatch:");
    expect(replay).toContain("release_candidate_sha:");
    expect(replay).not.toContain("\n  push:");

    expect(delivery).toContain("COMMIT_STAGE_EVENT: push");
    expect(delivery).toContain("INTEGRATION_GATE_EVENT: push");
  });

  it("keeps main red recovery wired to integration-gate push failures only", () => {
    const workflow = readUtf8(mainRedRecoveryWorkflowPath);

    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("- Integration Gate");
    expect(workflow).toContain("github.event.workflow_run.event == 'push'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'failure'");
    expect(workflow).toContain("main-red-recovery-${{ github.event.workflow_run.head_sha }}");
  });

  it("keeps one release-candidate build path and deploy finalizer that does not rebuild", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const deployFinalizerJob = extractJobBlock(workflow, "deploy_release_candidate");

    expect(workflow).toContain("name: build-release-candidate-api-image");
    expect(workflow).toContain("name: build-release-candidate-web-image");
    expect(workflow).toContain("name: build-release-candidate-worker-image");
    expect(workflow).toContain("name: build-release-candidate-codex-image");
    expect(workflow).toContain("name: capture-current-runtime-refs");

    expect(deployFinalizerJob).not.toContain("docker build");
    expect(deployFinalizerJob).not.toContain("docker push");
  });

  it("uses buildx with github cache for release-candidate image builds", () => {
    const workflow = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const buildJobs = [
      "build_release_candidate_api_image",
      "build_release_candidate_web_image",
      "build_release_candidate_worker_image",
      "build_release_candidate_codex_image"
    ];

    for (const jobName of buildJobs) {
      const block = extractJobBlock(workflow, jobName);
      expect(block).toContain("docker/setup-buildx-action@v3");
      expect(block).toContain("docker/build-push-action@v6");
      expect(block).toContain("cache-from: type=gha");
      expect(block).toContain("cache-to: type=gha");
      expect(block).not.toContain("freeze-release-candidate-refs.mjs");
    }
  });

  it("keeps wide production mutation topology in delivery and replay", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    for (const workflow of [delivery, replay]) {
      expect(workflow).toContain("  deploy_identity:");
      expect(workflow).toContain("  deploy_infra:");
      expect(workflow).toContain("  deploy_runtime:");
      expect(workflow).toContain("  deploy_release_candidate:");

      const runtimeJob = extractJobBlock(workflow, "deploy_runtime");
      expect(runtimeJob).toContain("- deploy_infra");

      const finalizerJob = extractJobBlock(workflow, "deploy_release_candidate");
      expect(finalizerJob).toContain("- deploy_identity");
      expect(finalizerJob).toContain("- deploy_infra");
      expect(finalizerJob).toContain("- deploy_runtime");
    }
  });

  it("keeps explicit production concurrency boundaries", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    for (const workflow of [delivery, replay]) {
      const identityConcurrency = extractConcurrencySettings(
        extractJobBlock(workflow, "deploy_identity")
      );
      const infraConcurrency = extractConcurrencySettings(
        extractJobBlock(workflow, "deploy_infra")
      );
      const runtimeConcurrency = extractConcurrencySettings(
        extractJobBlock(workflow, "deploy_runtime")
      );

      expect(identityConcurrency.group).toBe("production-identity-mutation");
      expect(identityConcurrency.cancelInProgress).toBe("false");
      expect(infraConcurrency.group).toBe("production-azure-mutation");
      expect(infraConcurrency.cancelInProgress).toBe("false");
      expect(runtimeConcurrency.group).toBe("production-azure-mutation");
      expect(runtimeConcurrency.cancelInProgress).toBe("false");
    }
  });

  it("requires acceptance YES and deploy-required true before production mutation", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    for (const workflow of [delivery, replay]) {
      for (const jobName of [
        "deploy_identity",
        "deploy_infra",
        "deploy_runtime",
        "deploy_release_candidate"
      ]) {
        const block = extractJobBlock(workflow, jobName);
        expect(block).toContain(
          "needs.automated_acceptance_test_gate.outputs.acceptance_decision == 'YES'"
        );
        expect(block).toContain(
          "needs.automated_acceptance_test_gate.outputs.deployment_required == 'true'"
        );
      }
    }
  });

  it("keeps acceptance and deployment stage decision jobs deterministic with always guards", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    const deliveryAcceptanceStageJob = extractJobBlock(delivery, "automated_acceptance_test_gate");
    const deliveryProductionStageJob = extractJobBlock(delivery, "deployment_stage");
    const replayAcceptanceStageJob = extractJobBlock(replay, "automated_acceptance_test_gate");
    const replayProductionStageJob = extractJobBlock(replay, "deployment_stage");

    expect(deliveryAcceptanceStageJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
    expect(deliveryProductionStageJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
    expect(replayAcceptanceStageJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
    expect(replayProductionStageJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
  });

  it("keeps release decision logic in shared scripts", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    expect(delivery).toContain(
      "node scripts/pipeline/shared/collect-cloud-deployment-stage-timing.mjs"
    );
    expect(replay).toContain(
      "node scripts/pipeline/shared/collect-cloud-deployment-stage-timing.mjs"
    );
    expect(delivery).toContain("node scripts/pipeline/shared/decide-release-outcome.mjs");
    expect(replay).toContain("node scripts/pipeline/shared/decide-release-outcome.mjs");
  });

  it("keeps one domain model: optional custom-domain vars, no mode flags", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath).toLowerCase();
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath).toLowerCase();
    const domainModeToken = ["infra", "domain", "mode"].join("_");

    expect(delivery).not.toContain(domainModeToken);
    expect(replay).not.toContain(domainModeToken);
    expect(delivery).not.toContain("assert-managed-certificate-contract.mjs");
    expect(replay).not.toContain("assert-managed-certificate-contract.mjs");

    expect(delivery).toContain("aca_api_custom_domain");
    expect(replay).toContain("aca_api_custom_domain");
    expect(delivery).toContain("aca_web_custom_domain");
    expect(replay).toContain("aca_web_custom_domain");

    for (const token of ["phase-1", "phase 1", "phase-2", "phase 2"]) {
      expect(delivery).not.toContain(token);
      expect(replay).not.toContain(token);
    }
  });

  it("keeps replay as no-rebuild path by loading existing release candidate artifact", () => {
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    expect(replay).toContain("name: resolve-replay-source");
    expect(replay).toContain("WORKFLOW_FILE: cloud-deployment-pipeline.yml");
    expect(replay).toContain(
      "name: release-candidate-${{ needs.resolve_replay_source.outputs.release_candidate_sha }}"
    );
    expect(replay).toContain("run-id: ${{ needs.resolve_replay_source.outputs.source_run_id }}");
    expect(replay).not.toContain("  build_release_candidate_api_image:");
    expect(replay).not.toContain("  build_release_candidate_web_image:");
    expect(replay).not.toContain("  build_release_candidate_worker_image:");
    expect(replay).not.toContain("  build_release_candidate_codex_image:");
  });

  it("keeps shared ARM infra apply script on explicit validate/create deployment names", () => {
    const script = readUtf8(sharedApplyScriptPath);

    expect(script).toMatch(/["']--name["'],\s*deploymentName/);
    expect(script).toContain('"validate"');
    expect(script).toContain('"create"');
  });
});
