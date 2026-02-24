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

  let deployRequired = true;
  let deploySkipReasonCode = "";
  let deliveryConfigRequired = false;

  if (docsOnlyChanged) {
    deployRequired = false;
    deploySkipReasonCode = "DOCS_ONLY_CHANGE";
  } else if (changeClass === "checks") {
    deployRequired = false;
    deploySkipReasonCode = "CHECKS_ONLY_CHANGE";
  } else if (changeClass === "desktop") {
    deployRequired = false;
    deploySkipReasonCode = "DESKTOP_ONLY_CHANGE";
  }

  if (infraChanged || identityChanged || requiresInfraConvergence) {
    deliveryConfigRequired = true;
  }

  await appendGithubOutput({
    deploy_required: String(deployRequired),
    delivery_config_required: String(deliveryConfigRequired),
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
