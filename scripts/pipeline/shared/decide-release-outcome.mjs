import path from "node:path";
import { evaluateReleaseOutcome } from "./decide-release-outcome-lib.mjs";
import { appendGithubOutput, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

async function main() {
  const headSha = process.env.HEAD_SHA?.trim() || requireEnv("RELEASE_PACKAGE_SHA");
  const releasePackageSha = requireEnv("RELEASE_PACKAGE_SHA");

  const result = evaluateReleaseOutcome({
    replayMode: process.env.REPLAY_MODE,
    commitStageResult: process.env.COMMIT_STAGE_RESULT,
    loadReleasePackageResult: process.env.LOAD_RELEASE_PACKAGE_RESULT,
    acceptanceStageResult: process.env.ACCEPTANCE_STAGE_RESULT,
    productionStageResult: process.env.PRODUCTION_STAGE_RESULT,
    acceptanceDecision: process.env.ACCEPTANCE_DECISION,
    acceptanceReasonCodes: process.env.ACCEPTANCE_REASON_CODES_JSON,
    productionDecision: process.env.PRODUCTION_DECISION,
    productionReasonCodes: process.env.PRODUCTION_REASON_CODES_JSON,
    deployRequired: process.env.DEPLOY_REQUIRED
  });

  const artifactPath = path.join(".artifacts", "release", headSha, "decision.json");

  await writeJsonFile(artifactPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    releasePackageSha,
    replayMode: result.replayMode,
    commitStage: result.commitStageDecision,
    acceptance: result.acceptanceDecision,
    production: result.productionDecision,
    deployRequired: result.deployRequired,
    releaseable: result.releaseable,
    reasonCodes: result.reasonCodes,
    releasePackage: {
      apiRef: process.env.RELEASE_PACKAGE_API_REF || "",
      webRef: process.env.RELEASE_PACKAGE_WEB_REF || "",
      codexRef: process.env.RELEASE_PACKAGE_CODEX_REF || ""
    }
  });

  await appendGithubOutput({
    releaseable: String(result.releaseable),
    reason_codes_json: JSON.stringify(result.reasonCodes),
    release_decision_path: artifactPath
  });

  if (!result.releaseable) {
    console.error("Release decision is NO");
    process.exit(1);
  }
}

void main();
