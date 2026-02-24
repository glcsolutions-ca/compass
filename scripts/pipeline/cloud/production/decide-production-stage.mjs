import { appendGithubOutput, requireEnv, writeJsonFile } from "../../shared/pipeline-utils.mjs";

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
  const deployRequired = asBool(process.env.DEPLOY_REQUIRED);

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
  } else if (!deployRequired) {
    productionDecision = "YES";
    reasonCodes = parseReasonCodes(process.env.ACCEPTANCE_REASON_CODES_JSON, [
      "NO_DEPLOY_REQUIRED"
    ]);
  } else {
    if (deployResult !== "success") {
      productionDecision = "NO";
      reasonCodes = ["DEPLOY_RELEASE_PACKAGE_FAILED"];
    } else if (
      (runtimeChanged || infraChanged || requiresInfraConvergence) &&
      verifyResult !== "success"
    ) {
      productionDecision = "NO";
      reasonCodes = ["PRODUCTION_BLACKBOX_VERIFY_FAILED"];
    }
  }

  const artifactPath = `.artifacts/production/${headSha}/result.json`;
  await writeJsonFile(artifactPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    changeClass,
    decision: productionDecision,
    deployRequired,
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
    releasePackage: {
      apiRef: process.env.RELEASE_PACKAGE_API_REF || "",
      webRef: process.env.RELEASE_PACKAGE_WEB_REF || "",
      codexRef: process.env.RELEASE_PACKAGE_CODEX_REF || ""
    },
    deploymentId
  });

  await appendGithubOutput({
    production_decision: productionDecision,
    reason_codes_json: JSON.stringify(reasonCodes)
  });
}

void main();
