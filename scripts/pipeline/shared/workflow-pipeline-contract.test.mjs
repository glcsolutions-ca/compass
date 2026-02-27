import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commitStageWorkflowPath = ".github/workflows/commit-stage.yml";
const integrationGateWorkflowPath = ".github/workflows/integration-gate.yml";
const cloudDeploymentPipelineWorkflowPath = ".github/workflows/cloud-deployment-pipeline.yml";
const cloudDeploymentPipelineReplayWorkflowPath =
  ".github/workflows/cloud-deployment-pipeline-replay.yml";
const dynamicSessionsAcceptanceRehearsalWorkflowPath =
  ".github/workflows/dynamic-sessions-acceptance-rehearsal.yml";
const mainRedRecoveryWorkflowPath = ".github/workflows/main-red-recovery.yml";
const legacyMergeGroupToken = ["merge", "group"].join("_");

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8");
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

  it("keeps cloud deployment push-only and replay manual-only", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);
    const rehearsal = readUtf8(dynamicSessionsAcceptanceRehearsalWorkflowPath);

    expect(delivery).toContain("push:");
    expect(delivery).not.toContain("workflow_dispatch:");

    expect(replay).toContain("workflow_dispatch:");
    expect(replay).toContain("release_candidate_sha:");
    expect(replay).not.toContain("\n  push:");
    expect(rehearsal).toContain("workflow_dispatch:");
    expect(rehearsal).toContain("release_candidate_sha:");
    expect(rehearsal).not.toContain("\n  push:");

    expect(delivery).toContain("COMMIT_STAGE_EVENT: push");
    expect(delivery).toContain("INTEGRATION_GATE_EVENT: push");
  });

  it("keeps build-once release candidate contract in delivery and no-rebuild replay", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);
    const rehearsal = readUtf8(dynamicSessionsAcceptanceRehearsalWorkflowPath);

    expect(delivery).toContain("build_release_candidate_images:");
    expect(delivery).toContain("publish_release_candidate:");
    expect(delivery).toContain("release-candidate-${{ env.HEAD_SHA }}");
    expect(delivery).toContain("release-candidate-ref-");

    expect(replay).toContain("resolve_replay_source:");
    expect(replay).toContain("WORKFLOW_FILE: cloud-deployment-pipeline.yml");
    expect(replay).toContain(
      "name: release-candidate-${{ needs.resolve_replay_source.outputs.release_candidate_sha }}"
    );
    expect(replay).toContain("run-id: ${{ needs.resolve_replay_source.outputs.source_run_id }}");
    expect(replay).not.toContain("build_release_candidate_images:");
    expect(rehearsal).toContain(
      "run-id: ${{ needs.resolve_rehearsal_source.outputs.source_run_id }}"
    );
    expect(rehearsal).not.toContain("build_release_candidate_images:");
  });

  it("uses single deploy-cloud and production-smoke flow in both workflows", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    for (const workflow of [delivery, replay]) {
      expect(workflow).toContain("deploy_cloud:");
      expect(workflow).toContain("production_smoke:");
      expect(workflow).toContain("release_decision:");
      expect(workflow).toContain("production-cloud-mutation");
      expect(workflow).toContain(
        "node scripts/pipeline/cloud/deployment-stage/validate-keyvault-secrets.mjs"
      );
      expect(workflow).toContain("node scripts/pipeline/cloud/deployment-stage/apply-infra.mjs");
      expect(workflow).toContain(
        "node scripts/pipeline/cloud/deployment-stage/verify-api-smoke.mjs"
      );
      expect(workflow).toContain(
        "node scripts/pipeline/cloud/deployment-stage/verify-agent-runtime-compatibility.mjs"
      );
    }
  });

  it("removes legacy acceptance topology and scripts from cloud workflows", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    for (const workflow of [delivery, replay]) {
      expect(workflow).not.toContain("automated_acceptance_test_gate");
      expect(workflow).not.toContain("runtime_api_system_acceptance");
      expect(workflow).not.toContain("runtime_browser_acceptance");
      expect(workflow).not.toContain("infra_readonly_acceptance");
      expect(workflow).not.toContain("identity_readonly_acceptance");
      expect(workflow).not.toContain("scripts/pipeline/shared/render-infra-parameters.mjs");
      expect(workflow).not.toContain(
        "scripts/pipeline/shared/validate-infra-acceptance-config.mjs"
      );
      expect(workflow).not.toContain("scripts/pipeline/shared/resolve-stage-eligibility.mjs");
      expect(workflow).not.toContain("scripts/pipeline/cloud/automated-acceptance-test-gate/");
    }
  });

  it("uses Key Vault and shared OIDC client without legacy secret passthrough", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    for (const workflow of [delivery, replay]) {
      expect(workflow).toContain("client-id: ${{ vars.AZURE_GITHUB_CLIENT_ID }}");
      expect(workflow).toContain("KEY_VAULT_NAME: ${{ vars.KEY_VAULT_NAME }}");

      expect(workflow).not.toContain("AZURE_ACCEPTANCE_CLIENT_ID");
      expect(workflow).not.toContain("AZURE_IDENTITY_CLIENT_ID");
      expect(workflow).not.toContain("AZURE_ACCEPTANCE_IDENTITY_CLIENT_ID");
      expect(workflow).not.toContain("WEB_SESSION_SECRET: ${{ secrets.WEB_SESSION_SECRET }}");
      expect(workflow).not.toContain("ENTRA_CLIENT_SECRET: ${{ secrets.ENTRA_CLIENT_SECRET }}");
      expect(workflow).not.toContain(
        "AUTH_OIDC_STATE_ENCRYPTION_KEY: ${{ secrets.AUTH_OIDC_STATE_ENCRYPTION_KEY }}"
      );
      expect(workflow).not.toContain(
        "OAUTH_TOKEN_SIGNING_SECRET: ${{ secrets.OAUTH_TOKEN_SIGNING_SECRET }}"
      );
    }
  });

  it("keeps release decision and stage timing evidence in shared cloud pipeline scripts", () => {
    const delivery = readUtf8(cloudDeploymentPipelineWorkflowPath);
    const replay = readUtf8(cloudDeploymentPipelineReplayWorkflowPath);

    expect(delivery).toContain(
      "node scripts/pipeline/shared/collect-cloud-deployment-stage-timing.mjs"
    );
    expect(replay).toContain(
      "node scripts/pipeline/shared/collect-cloud-deployment-stage-timing.mjs"
    );
    expect(delivery).toContain(".artifacts/release/${{ env.HEAD_SHA }}/decision.json");
    expect(replay).toContain(".artifacts/release/$HEAD_SHA/decision.json");
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
});
