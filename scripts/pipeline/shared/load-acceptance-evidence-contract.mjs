import { appendGithubOutput, readJsonFile, requireEnv } from "./pipeline-utils.mjs";

async function main() {
  const evidencePath = requireEnv("ACCEPTANCE_EVIDENCE_PATH");
  const runId = process.env.RUN_ID?.trim() || "";

  const evidence = await readJsonFile(evidencePath);
  if (String(evidence?.schemaVersion || "") !== "1") {
    throw new Error(`Unsupported acceptance evidence schemaVersion: ${evidence?.schemaVersion}`);
  }

  const acceptanceStageResult = String(evidence?.checks?.acceptanceStage || "").trim();
  if (!["success", "not-required"].includes(acceptanceStageResult)) {
    throw new Error(
      `Acceptance stage result must be success or not-required for ${evidence?.headSha}`
    );
  }

  const headSha = String(evidence?.headSha || "").trim();
  const changeClass = String(evidence?.changeClass || "").trim();
  if (!headSha) {
    throw new Error("Acceptance evidence missing headSha");
  }
  if (!changeClass) {
    throw new Error("Acceptance evidence missing changeClass");
  }

  await appendGithubOutput({
    head_sha: headSha,
    change_class: changeClass,
    runtime_changed: String(Boolean(evidence?.scope?.runtime)),
    infra_changed: String(Boolean(evidence?.scope?.infra)),
    identity_changed: String(Boolean(evidence?.scope?.identity)),
    docs_only_changed: String(Boolean(evidence?.scope?.docsOnly)),
    requires_infra_convergence: String(Boolean(evidence?.requiresInfraConvergence)),
    requires_migrations: String(Boolean(evidence?.requiresMigrations)),
    candidate_api_ref: String(evidence?.candidate?.apiRef || ""),
    candidate_web_ref: String(evidence?.candidate?.webRef || ""),
    acceptance_run_id: runId,
    acceptance_stage_result: acceptanceStageResult
  });

  console.info(`Loaded acceptance evidence contract for ${evidence?.headSha || "unknown"}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
