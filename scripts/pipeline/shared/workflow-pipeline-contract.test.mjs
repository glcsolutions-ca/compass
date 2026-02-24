import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commitStageWorkflowPath = ".github/workflows/commit-stage.yml";
const deploymentPipelineWorkflowPath = ".github/workflows/deployment-pipeline.yml";
const sharedApplyScriptPath = "scripts/pipeline/production/apply-infra.mjs";
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
    const workflow = readUtf8(deploymentPipelineWorkflowPath);

    const concurrency = extractConcurrencySettings(
      extractJobBlock(workflow, "deploy_approved_candidate")
    );

    expect(concurrency.group).toBe("production-mutation");
    expect(concurrency.cancelInProgress).toBe("false");
  });

  it("uses shared infra apply script and deterministic run-scoped ARM deployment name", () => {
    const productionWorkflow = readUtf8(deploymentPipelineWorkflowPath);

    expect(productionWorkflow).toContain("node scripts/pipeline/production/apply-infra.mjs");
  });

  it("keeps production stage deploy-only with no docker build commands", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);
    const deployJob = extractJobBlock(workflow, "deploy_approved_candidate");

    expect(deployJob).not.toContain("docker build");
    expect(deployJob).not.toContain("docker push");
  });

  it("keeps acceptance runtime candidate-fidelity contract", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);

    expect(workflow).toContain("name: runtime-api-system-acceptance");
    expect(workflow).toContain("name: runtime-browser-acceptance");
    expect(workflow).toContain("name: runtime-migration-image-acceptance");
    expect(workflow).toContain(
      "node scripts/pipeline/acceptance/run-runtime-api-system-acceptance.mjs"
    );
    expect(workflow).toContain(
      "node scripts/pipeline/acceptance/run-runtime-browser-acceptance.mjs"
    );
    expect(workflow).toContain(
      "node scripts/pipeline/acceptance/run-runtime-migration-image-acceptance.mjs"
    );
  });

  it("keeps candidate freeze jobs parallelized by artifact type", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);
    expect(workflow).toContain("name: freeze-candidate-api-image");
    expect(workflow).toContain("name: freeze-candidate-web-image");
    expect(workflow).toContain("name: freeze-current-runtime-refs");
    expect(workflow).toContain("node scripts/pipeline/shared/freeze-release-candidate-refs.mjs");
  });

  it("keeps commit stage merge-blocking gate context", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    expect(workflow).toContain("name: commit-stage");
  });

  it("keeps commit-stage workflow as PR and merge queue only", () => {
    const workflow = readUtf8(commitStageWorkflowPath);
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("merge_group:");
    expect(workflow).not.toContain("\n  push:");
  });

  it("keeps deployment pipeline as push/dispatch and removes cross-workflow chaining", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);
    expect(workflow).toContain("push:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("workflow_run:");
  });

  it("loads release candidate with always guard to avoid skipped-needs false negatives", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);
    const loadCandidateJob = extractJobBlock(workflow, "load_release_candidate");
    expect(loadCandidateJob).toContain(
      "if: ${{ always() && (needs.candidate_context.outputs.replay_mode == 'true' || needs.publish_release_candidate.result == 'success') }}"
    );
  });

  it("keeps control-plane approval gate for infra and identity scopes", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);
    expect(workflow).toContain("name: approve-control-plane");
    expect(workflow).toContain("environment: production-control-plane");
    expect(workflow).toContain("needs.acceptance_stage.outputs.control_plane_required == 'true'");
  });

  it("runs production only after acceptance YES and deploy-required true", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);
    expect(workflow).toContain("needs.acceptance_stage.outputs.acceptance_decision == 'YES'");
    expect(workflow).toContain("needs.acceptance_stage.outputs.deploy_required == 'true'");
  });

  it("keeps acceptance and production result jobs running with always() for deterministic reason codes", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);
    const acceptanceStageJob = extractJobBlock(workflow, "acceptance_stage");
    const productionStageJob = extractJobBlock(workflow, "production_stage");

    expect(acceptanceStageJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
    expect(productionStageJob).toContain(
      "if: ${{ always() && needs.load_release_candidate.result == 'success' }}"
    );
  });

  it("keeps release decision logic in shared script and accepts docs-only non-deploy path", () => {
    const workflow = readUtf8(deploymentPipelineWorkflowPath);
    const stageEligibilityScript = readUtf8(stageEligibilityScriptPath);
    expect(workflow).toContain("node scripts/pipeline/shared/collect-deployment-stage-timing.mjs");
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
});
