import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commitStageWorkflowPath = ".github/workflows/commit-stage.yml";
const acceptanceStageWorkflowPath = ".github/workflows/acceptance-stage.yml";
const cloudDeploymentPipelineWorkflowPath = ".github/workflows/cloud-deployment-pipeline.yml";
const cloudDeploymentPipelineReplayWorkflowPath =
  ".github/workflows/cloud-deployment-pipeline-replay.yml";
const dynamicSessionsAcceptanceRehearsalWorkflowPath =
  ".github/workflows/dynamic-sessions-acceptance-rehearsal.yml";
const labelerWorkflowPath = ".github/workflows/labeler.yml";
const mainRedRecoveryWorkflowPath = ".github/workflows/main-red-recovery.yml";

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8");
}

describe("workflow pipeline contract", () => {
  it("keeps commit-stage merge-queue ready and PR-only", () => {
    const commitStage = readUtf8(commitStageWorkflowPath);

    expect(commitStage).toContain("name: commit-stage");
    expect(commitStage).toContain("pull_request:");
    expect(commitStage).toContain("merge_group:");
    expect(commitStage).toContain("checks_requested");
    expect(commitStage).not.toContain("\n  push:");
  });

  it("keeps acceptance-stage as queue-authoritative gate", () => {
    const acceptanceStage = readUtf8(acceptanceStageWorkflowPath);

    expect(acceptanceStage).toContain("name: acceptance-stage");
    expect(acceptanceStage).toContain("pull_request:");
    expect(acceptanceStage).toContain("merge_group:");
    expect(acceptanceStage).toContain("name: package-once-${{ matrix.service.name }}");
    expect(acceptanceStage).toContain("name: integration-testing");
    expect(acceptanceStage).toContain("name: staging-rehearsal-low-risk");
    expect(acceptanceStage).toContain("name: staging-rehearsal-high-risk");
    expect(acceptanceStage).toContain(
      ".artifacts/release-candidate/${{ env.TESTED_SHA }}/manifest.json"
    );
  });

  it("keeps cloud deployment push-only and promotion-oriented", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);

    expect(delivery).toContain("push:");
    expect(delivery).not.toContain("workflow_dispatch:");
    expect(delivery).toContain("resolve_acceptance_source:");
    expect(delivery).toContain("load_release_candidate:");
    expect(delivery).toContain("WORKFLOW_FILE: acceptance-stage.yml");
    expect(delivery).not.toContain("build_release_candidate_images:");
    expect(delivery).not.toContain("publish_release_candidate:");
  });

  it("keeps replay and rehearsal manual-only with acceptance-stage manifest sourcing", () => {
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);
    const rehearsal = readUtf8(dynamicSessionsAcceptanceRehearsalWorkflowPath);

    expect(replay).toContain("workflow_dispatch:");
    expect(replay).toContain("release_candidate_sha:");
    expect(replay).not.toContain("\n  push:");
    expect(replay).toContain("WORKFLOW_FILE: acceptance-stage.yml");

    expect(rehearsal).toContain("workflow_dispatch:");
    expect(rehearsal).toContain("release_candidate_sha:");
    expect(rehearsal).not.toContain("\n  push:");
    expect(rehearsal).toContain("WORKFLOW_FILE: acceptance-stage.yml");
  });

  it("keeps non-mutating post-merge failure semantics", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);

    expect(delivery).toContain("PROMOTION_HALTED");
    expect(delivery).toContain("PRODUCTION_VERIFICATION_FAILED_NO_REVERT");
    expect(delivery).toContain("autoRevertAttempted");
  });

  it("keeps PR labeler workflow for advisory risk/scope", () => {
    const labeler = readUtf8(labelerWorkflowPath);

    expect(labeler).toContain("name: PR Labels");
    expect(labeler).toContain("pull_request:");
    expect(labeler).toContain("actions/labeler@v6");
  });

  it("removes auto-revert workflow", () => {
    expect(existsSync(mainRedRecoveryWorkflowPath)).toBe(false);
  });
});
