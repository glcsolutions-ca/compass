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

  it("keeps one release package build path and deploy stage that does not rebuild", () => {
    const workflow = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const deployJob = extractJobBlock(workflow, "deploy_release_package");

    expect(workflow).toContain("name: build-release-package-api-image");
    expect(workflow).toContain("name: build-release-package-web-image");
    expect(workflow).toContain("name: build-release-package-codex-image");
    expect(workflow).toContain("name: capture-current-runtime-refs");

    expect(deployJob).not.toContain("docker build");
    expect(deployJob).not.toContain("docker push");
  });

  it("serializes production mutation in both delivery and replay", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

    const deliveryConcurrency = extractConcurrencySettings(
      extractJobBlock(delivery, "deploy_release_package")
    );
    const replayConcurrency = extractConcurrencySettings(
      extractJobBlock(replay, "deploy_release_package")
    );

    expect(deliveryConcurrency.group).toBe("production-mutation");
    expect(deliveryConcurrency.cancelInProgress).toBe("false");
    expect(replayConcurrency.group).toBe("production-mutation");
    expect(replayConcurrency.cancelInProgress).toBe("false");
  });

  it("requires acceptance YES and deploy-required true before production deploy", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath);
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath);

    expect(delivery).toContain("needs.acceptance_stage.outputs.acceptance_decision == 'YES'");
    expect(delivery).toContain("needs.acceptance_stage.outputs.deploy_required == 'true'");

    expect(replay).toContain("needs.acceptance_stage.outputs.acceptance_decision == 'YES'");
    expect(replay).toContain("needs.acceptance_stage.outputs.deploy_required == 'true'");
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

  it("keeps release-decision logic in shared scripts", () => {
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

  it("keeps cloud workflows free of domain-mode and phase-based branching toggles", () => {
    const delivery = readUtf8(cloudDeliveryPipelineWorkflowPath).toLowerCase();
    const replay = readUtf8(cloudDeliveryReplayWorkflowPath).toLowerCase();
    const domainModeToken = ["infra", "domain", "mode"].join("_");

    expect(delivery).not.toContain(domainModeToken);
    expect(replay).not.toContain(domainModeToken);

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
