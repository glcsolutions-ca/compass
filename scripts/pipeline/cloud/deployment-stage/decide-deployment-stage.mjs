import { appendGithubOutput, requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";
import { createCcsError, withCcsGuardrail } from "../../shared/ccs-contract.mjs";

function asBool(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}

function parseReasonCodes(raw, fallback = []) {
  if (!raw || String(raw).trim().length === 0) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value || "").trim()).filter((value) => value.length > 0);
    }
  } catch {
    // fall through
  }

  return fallback;
}

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const acceptanceDecision = String(process.env.ACCEPTANCE_DECISION || "NO").trim();
  const deploymentRequired = asBool(process.env.DEPLOYMENT_REQUIRED);

  const runtimeChanged = asBool(process.env.RUNTIME_CHANGED);
  const desktopChanged = asBool(process.env.DESKTOP_CHANGED);
  const infraChanged = asBool(process.env.INFRA_CHANGED);
  const identityChanged = asBool(process.env.IDENTITY_CHANGED);
  const requiresInfraConvergence = asBool(process.env.REQUIRES_INFRA_CONVERGENCE);
  const changeClass = String(process.env.CHANGE_CLASS || "").trim();

  const deployResult = String(process.env.DEPLOY_RESULT || "skipped").trim();
  const verifyResult = String(process.env.VERIFY_RESULT || "skipped").trim();
  const deploymentId = String(process.env.DEPLOYMENT_ID || "").trim();

  let productionDecision = "YES";
  let reasonCodes = [];

  if (acceptanceDecision !== "YES") {
    productionDecision = "NO";
    reasonCodes = parseReasonCodes(process.env.ACCEPTANCE_REASON_CODES_JSON, [
      "ACCEPTANCE_DECISION_NOT_YES"
    ]);
  } else if (!deploymentRequired) {
    productionDecision = "YES";
    reasonCodes = parseReasonCodes(process.env.ACCEPTANCE_REASON_CODES_JSON, [
      "NO_DEPLOYMENT_REQUIRED"
    ]);
  } else {
    if (deployResult !== "success") {
      productionDecision = "NO";
      reasonCodes = ["DEPLOY_RELEASE_CANDIDATE_FAILED"];
    } else if (
      (runtimeChanged || infraChanged || requiresInfraConvergence) &&
      verifyResult !== "success"
    ) {
      productionDecision = "NO";
      reasonCodes = ["PRODUCTION_BLACKBOX_VERIFY_FAILED"];
    }
  }

  const artifactPath = `.artifacts/deployment-stage/${headSha}/result.json`;
  await writeJsonFile(artifactPath, {
    schemaVersion: "1",
    ccsVersion: "1",
    guardrailId: "deployment.stage-decision",
    generatedAt: new Date().toISOString(),
    headSha,
    changeClass,
    decision: productionDecision,
    deploymentRequired,
    reasonCodes,
    scope: {
      runtime: runtimeChanged,
      desktop: desktopChanged,
      infra: infraChanged,
      identity: identityChanged
    },
    checks: {
      deployReleasePackageResult: deployResult,
      productionBlackboxVerifyResult: verifyResult
    },
    releaseCandidate: {
      apiRef: process.env.RELEASE_CANDIDATE_API_REF || "",
      webRef: process.env.RELEASE_CANDIDATE_WEB_REF || "",
      workerRef: process.env.RELEASE_CANDIDATE_WORKER_REF || "",
      dynamicSessionsRuntimeRef: process.env.RELEASE_CANDIDATE_DYNAMIC_SESSIONS_RUNTIME_REF || ""
    },
    deploymentId
  });

  await appendGithubOutput({
    production_decision: productionDecision,
    reason_codes_json: JSON.stringify(reasonCodes)
  });

  if (productionDecision !== "YES") {
    throw createCcsError({
      code: reasonCodes[0] || "DEPLOYMENT_STAGE_FAIL",
      why: `Deployment stage decision is ${productionDecision}.`,
      fix: "Deployment-stage checks must pass before production decision is YES.",
      doCommands: [
        `cat ${artifactPath}`,
        'gh run view "$GITHUB_RUN_ID" --log',
        "fix deployment-stage failures and rerun"
      ],
      ref: "docs/agents/troubleshooting.md#deployment-stage-failure"
    });
  }

  return { status: "pass", code: "DEPLOYMENT_STAGE_PASS" };
}

void withCcsGuardrail({
  guardrailId: "deployment.stage-decision",
  command: "node scripts/pipeline/cloud/deployment-stage/decide-deployment-stage.mjs",
  passCode: "DEPLOYMENT_STAGE_PASS",
  passRef: "docs/agents/troubleshooting.md#deployment-stage-failure",
  run: main,
  mapError: (error) => ({
    code: "CCS_UNEXPECTED_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve deployment stage decision runtime errors.",
    doCommands: ["node scripts/pipeline/cloud/deployment-stage/decide-deployment-stage.mjs"],
    ref: "docs/ccs.md#output-format"
  })
});
