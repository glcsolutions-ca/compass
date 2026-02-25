import path from "node:path";
import { evaluateReleaseOutcome } from "./decide-release-outcome-lib.mjs";
import { appendGithubOutput, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

async function main() {
  const headSha = process.env.HEAD_SHA?.trim() || requireEnv("RELEASE_CANDIDATE_SHA");
  const releaseCandidateSha = requireEnv("RELEASE_CANDIDATE_SHA");

  const result = evaluateReleaseOutcome({
    replayMode: process.env.REPLAY_MODE,
    commitStageResult: process.env.COMMIT_STAGE_RESULT,
    loadReleaseCandidateResult: process.env.LOAD_RELEASE_CANDIDATE_RESULT,
    automatedAcceptanceTestGateResult: process.env.AUTOMATED_ACCEPTANCE_TEST_GATE_RESULT,
    deploymentStageResult: process.env.DEPLOYMENT_STAGE_RESULT,
    acceptanceDecision: process.env.ACCEPTANCE_DECISION,
    acceptanceReasonCodes: process.env.ACCEPTANCE_REASON_CODES_JSON,
    productionDecision: process.env.PRODUCTION_DECISION,
    productionReasonCodes: process.env.PRODUCTION_REASON_CODES_JSON,
    deploymentRequired: process.env.DEPLOYMENT_REQUIRED
  });

  const artifactPath = path.join(".artifacts", "release", headSha, "decision.json");

  await writeJsonFile(artifactPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    releaseCandidateSha,
    replayMode: result.replayMode,
    commitStage: result.commitStageDecision,
    acceptance: result.acceptanceDecision,
    production: result.productionDecision,
    deploymentRequired: result.deploymentRequired,
    releasable: result.releasable,
    reasonCodes: result.reasonCodes,
    releaseCandidate: {
      apiRef: process.env.RELEASE_CANDIDATE_API_REF || "",
      webRef: process.env.RELEASE_CANDIDATE_WEB_REF || "",
      workerRef: process.env.RELEASE_CANDIDATE_WORKER_REF || "",
      codexRef: process.env.RELEASE_CANDIDATE_CODEX_REF || ""
    }
  });

  await appendGithubOutput({
    releasable: String(result.releasable),
    reason_codes_json: JSON.stringify(result.reasonCodes),
    release_decision_path: artifactPath
  });

  if (!result.releasable) {
    console.error("Release decision is NO");
    process.exit(1);
  }
}

void main();
