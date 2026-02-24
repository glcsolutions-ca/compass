import path from "node:path";
import { appendGithubOutput, readJsonFile, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

const DIGEST_PATTERN = /^.+@sha256:[a-fA-F0-9]{64}$/;

function asBoolean(value) {
  return value === true;
}

async function main() {
  const manifestPath = requireEnv("CANDIDATE_MANIFEST_PATH");
  const runId = process.env.RUN_ID?.trim() || "";

  const manifest = await readJsonFile(manifestPath);
  if (String(manifest?.schemaVersion || "") !== "1") {
    throw new Error(`Unsupported release candidate schemaVersion: ${manifest?.schemaVersion}`);
  }

  const runtimeChanged = asBoolean(manifest?.scope?.runtime);
  const desktopChanged = asBoolean(manifest?.scope?.desktop);
  const infraChanged = asBoolean(manifest?.scope?.infra);
  const identityChanged = asBoolean(manifest?.scope?.identity);
  const docsOnlyChanged = asBoolean(manifest?.scope?.docsOnly);

  const changeClass = String(manifest?.changeClass || "").trim();
  const requiresInfraConvergence = asBoolean(manifest?.requiresInfraConvergence);
  const requiresMigrations = asBoolean(manifest?.requiresMigrations);

  const candidateApiRef = String(manifest?.candidate?.apiRef || "");
  const candidateWebRef = String(manifest?.candidate?.webRef || "");

  const reasonCodes = [];
  const requiresCandidateRefs = runtimeChanged || infraChanged || requiresInfraConvergence;

  if (requiresCandidateRefs) {
    if (!candidateApiRef) {
      reasonCodes.push("CANDIDATE_API_REF_MISSING");
    }
    if (!candidateWebRef) {
      reasonCodes.push("CANDIDATE_WEB_REF_MISSING");
    }

    if (candidateApiRef && !DIGEST_PATTERN.test(candidateApiRef)) {
      reasonCodes.push("CANDIDATE_API_REF_NOT_DIGEST");
    }
    if (candidateWebRef && !DIGEST_PATTERN.test(candidateWebRef)) {
      reasonCodes.push("CANDIDATE_WEB_REF_NOT_DIGEST");
    }
  }

  const candidateRefContractStatus = reasonCodes.length === 0 ? "pass" : "fail";

  const headSha = String(manifest?.headSha || "").trim();
  if (!headSha) {
    throw new Error("Release candidate contract missing headSha");
  }
  if (!changeClass) {
    throw new Error("Release candidate contract missing changeClass");
  }
  const copyPath = path.join(
    ".artifacts",
    "acceptance",
    headSha,
    "release-candidate-manifest.json"
  );

  await writeJsonFile(copyPath, manifest);

  await appendGithubOutput({
    head_sha: headSha,
    change_class: changeClass,
    runtime_changed: String(runtimeChanged),
    desktop_changed: String(desktopChanged),
    infra_changed: String(infraChanged),
    identity_changed: String(identityChanged),
    docs_only_changed: String(docsOnlyChanged),
    requires_infra_convergence: String(requiresInfraConvergence),
    requires_migrations: String(requiresMigrations),
    candidate_api_ref: candidateApiRef,
    candidate_web_ref: candidateWebRef,
    commit_run_id: runId,
    candidate_ref_contract_status: candidateRefContractStatus,
    candidate_ref_contract_reason_codes_json: JSON.stringify(reasonCodes),
    release_candidate_manifest_copy_path: copyPath
  });

  console.info(`Loaded release candidate contract for ${headSha}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
