import { appendGithubOutput } from "./pipeline-utils.mjs";

function asBool(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}

async function resolveAcceptanceEligibility() {
  const changeClass = String(process.env.CHANGE_CLASS || "").trim();
  const infraChanged = asBool(process.env.INFRA_CHANGED);
  const identityChanged = asBool(process.env.IDENTITY_CHANGED);
  const docsOnlyChanged = asBool(process.env.DOCS_ONLY_CHANGED);
  const requiresInfraConvergence = asBool(process.env.REQUIRES_INFRA_CONVERGENCE);

  let deploymentRequired = true;
  let deploySkipReasonCode = "";
  let deploymentPipelineConfigRequired = false;

  if (docsOnlyChanged) {
    deploymentRequired = false;
    deploySkipReasonCode = "DOCS_ONLY_CHANGE";
  } else if (changeClass === "checks") {
    deploymentRequired = false;
    deploySkipReasonCode = "CHECKS_ONLY_CHANGE";
  } else if (changeClass === "desktop") {
    deploymentRequired = false;
    deploySkipReasonCode = "DESKTOP_ONLY_CHANGE";
  }

  if (infraChanged || identityChanged || requiresInfraConvergence) {
    deploymentPipelineConfigRequired = true;
  }

  await appendGithubOutput({
    deployment_required: String(deploymentRequired),
    deployment_pipeline_config_required: String(deploymentPipelineConfigRequired),
    deploy_skip_reason_code: deploySkipReasonCode
  });
}

async function main() {
  const mode = String(process.env.STAGE_ELIGIBILITY_MODE || "acceptance")
    .trim()
    .toLowerCase();

  if (mode === "acceptance") {
    await resolveAcceptanceEligibility();
    return;
  }

  throw new Error(`Unsupported STAGE_ELIGIBILITY_MODE: ${mode}`);
}

void main();
