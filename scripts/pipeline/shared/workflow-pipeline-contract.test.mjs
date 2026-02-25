import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commitStageWorkflowPath = ".github/workflows/commit-stage.yml";
const mergeQueueGateWorkflowPath = ".github/workflows/merge-queue-gate.yml";
const cloudDeliveryPipelineWorkflowPath = ".github/workflows/cloud-delivery-pipeline.yml";
const cloudDeliveryReplayWorkflowPath = ".github/workflows/cloud-delivery-replay.yml";
const sharedApplyScriptPath = "scripts/pipeline/cloud/production/apply-infra.mjs";

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
  it("keeps commit and merge-queue checks as explicit pre-main gates", () => {
    const commitStage = readUtf8(commitStageWorkflowPath);
    const mergeQueueGate = readUtf8(mergeQueueGateWorkflowPath);

    expect(commitStage).toContain("name: commit-stage");
    expect(commitStage).toContain("pull_request:");
    expect(commitStage).toContain("merge_group:");

    expect(mergeQueueGate).toContain("name: merge-queue-gate");
    expect(mergeQueueGate).toContain("pull_request:");
    expect(mergeQueueGate).toContain("merge_group:");
  });

  it("keeps cloud delivery workflow push-only and replay workflow manual-only", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

    expect(delivery).toContain("push:");
    expect(delivery).not.toContain("workflow_dispatch:");

    expect(replay).toContain("workflow_dispatch:");
    expect(replay).toContain("release_package_sha:");
    expect(replay).not.toContain("\n  push:");
  });

  it("keeps one release-package build path and deploy finalizer that does not rebuild", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const deployFinalizerJob = extractJobBlock(workflow, "deploy_release_package");

    expect(workflow).toContain("name: build-release-package-api-image");
    expect(workflow).toContain("name: build-release-package-web-image");
    expect(workflow).toContain("name: build-release-package-codex-image");
    expect(workflow).toContain("name: capture-current-runtime-refs");

    expect(deployFinalizerJob).not.toContain("docker build");
    expect(deployFinalizerJob).not.toContain("docker push");
  });

  it("keeps wide production mutation topology in delivery and replay", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

    for (const workflow of [delivery, replay]) {
      expect(workflow).toContain("  deploy_identity:");
      expect(workflow).toContain("  deploy_infra:");
      expect(workflow).toContain("  deploy_runtime:");
      expect(workflow).toContain("  deploy_release_package:");

      const runtimeJob = extractJobBlock(workflow, "deploy_runtime");
      expect(runtimeJob).toContain("- deploy_infra");

      const finalizerJob = extractJobBlock(workflow, "deploy_release_package");
      expect(finalizerJob).toContain("- deploy_identity");
      expect(finalizerJob).toContain("- deploy_infra");
      expect(finalizerJob).toContain("- deploy_runtime");
    }
  });

  it("keeps explicit production concurrency boundaries", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

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
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

    for (const workflow of [delivery, replay]) {
      for (const jobName of [
        "deploy_identity",
        "deploy_infra",
        "deploy_runtime",
        "deploy_release_package"
      ]) {
        const block = extractJobBlock(workflow, jobName);
        expect(block).toContain("needs.acceptance_stage.outputs.acceptance_decision == 'YES'");
        expect(block).toContain("needs.acceptance_stage.outputs.deploy_required == 'true'");
      }
    }
  });

  it("keeps acceptance and production stage decision jobs deterministic with always guards", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

    const deliveryAcceptanceStageJob = extractJobBlock(delivery, "acceptance_stage");
    const deliveryProductionStageJob = extractJobBlock(delivery, "production_stage");
    const replayAcceptanceStageJob = extractJobBlock(replay, "acceptance_stage");
    const replayProductionStageJob = extractJobBlock(replay, "production_stage");

    expect(deliveryAcceptanceStageJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(deliveryProductionStageJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(replayAcceptanceStageJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
    expect(replayProductionStageJob).toContain(
      "if: ${{ always() && needs.load_release_package.result == 'success' }}"
    );
  });

  it("keeps release decision logic in shared scripts", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

    expect(delivery).toContain(
      "node scripts/pipeline/shared/collect-cloud-delivery-stage-timing.mjs"
    );
    expect(replay).toContain(
      "node scripts/pipeline/shared/collect-cloud-delivery-stage-timing.mjs"
    );
    expect(delivery).toContain("node scripts/pipeline/shared/decide-release-outcome.mjs");
    expect(replay).toContain("node scripts/pipeline/shared/decide-release-outcome.mjs");
  });

  it("keeps one domain model: optional custom-domain vars, no mode flags", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath).toLowerCase();
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath).toLowerCase();
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

  it("keeps replay as no-rebuild path by loading existing release package artifact", () => {
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

    expect(replay).toContain("name: resolve-replay-source");
    expect(replay).toContain("WORKFLOW_FILE: cloud-delivery-pipeline.yml");
    expect(replay).toContain(
      "name: release-package-${{ needs.resolve_replay_source.outputs.release_package_sha }}"
    );
    expect(replay).toContain("run-id: ${{ needs.resolve_replay_source.outputs.source_run_id }}");
    expect(replay).not.toContain("  build_release_package_api_image:");
    expect(replay).not.toContain("  build_release_package_web_image:");
    expect(replay).not.toContain("  build_release_package_codex_image:");
  });

  it("keeps shared ARM infra apply script on explicit validate/create deployment names", () => {
    const script = readUtf8(sharedApplyScriptPath);

    expect(script).toMatch(/["']--name["'],\s*deploymentName/);
    expect(script).toContain('"validate"');
    expect(script).toContain('"create"');
  });
});
