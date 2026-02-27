import path from "node:path";
import { appendGithubOutput, readJsonFile, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";
import { createCcsError, withCcsGuardrail } from "./ccs-contract.mjs";

const DIGEST_PATTERN = /^.+@sha256:[a-fA-F0-9]{64}$/;

function asBoolean(value) {
  return value === true;
}

async function main() {
  const manifestPath = requireEnv("RELEASE_CANDIDATE_MANIFEST_PATH");
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

  const releaseCandidateApiRef = String(manifest?.releaseCandidate?.apiRef || "");
  const releaseCandidateWebRef = String(manifest?.releaseCandidate?.webRef || "");
  const releaseCandidateWorkerRef = String(manifest?.releaseCandidate?.workerRef || "");
  const releaseCandidateDynamicSessionsRuntimeRef = String(
    manifest?.releaseCandidate?.dynamicSessionsRuntimeRef || ""
  );

  const reasonCodes = [];
  const requiresReleasePackageRefs = runtimeChanged || infraChanged || requiresInfraConvergence;

  if (requiresReleasePackageRefs) {
    if (!releaseCandidateApiRef) {
      reasonCodes.push("RELEASE_CANDIDATE_API_REF_MISSING");
    }
    if (!releaseCandidateWebRef) {
      reasonCodes.push("RELEASE_CANDIDATE_WEB_REF_MISSING");
    }
    if (!releaseCandidateWorkerRef) {
      reasonCodes.push("RELEASE_CANDIDATE_WORKER_REF_MISSING");
    }
    if (!releaseCandidateDynamicSessionsRuntimeRef) {
      reasonCodes.push("RELEASE_CANDIDATE_DYNAMIC_SESSIONS_RUNTIME_REF_MISSING");
    }

    if (releaseCandidateApiRef && !DIGEST_PATTERN.test(releaseCandidateApiRef)) {
      reasonCodes.push("RELEASE_CANDIDATE_API_REF_NOT_DIGEST");
    }
    if (releaseCandidateWebRef && !DIGEST_PATTERN.test(releaseCandidateWebRef)) {
      reasonCodes.push("RELEASE_CANDIDATE_WEB_REF_NOT_DIGEST");
    }
    if (releaseCandidateWorkerRef && !DIGEST_PATTERN.test(releaseCandidateWorkerRef)) {
      reasonCodes.push("RELEASE_CANDIDATE_WORKER_REF_NOT_DIGEST");
    }
    if (
      releaseCandidateDynamicSessionsRuntimeRef &&
      !DIGEST_PATTERN.test(releaseCandidateDynamicSessionsRuntimeRef)
    ) {
      reasonCodes.push("RELEASE_CANDIDATE_DYNAMIC_SESSIONS_RUNTIME_REF_NOT_DIGEST");
    }
  }

  const releaseCandidateRefContractStatus = reasonCodes.length === 0 ? "pass" : "fail";

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
    release_candidate_api_ref: releaseCandidateApiRef,
    release_candidate_web_ref: releaseCandidateWebRef,
    release_candidate_worker_ref: releaseCandidateWorkerRef,
    release_candidate_dynamic_sessions_runtime_ref: releaseCandidateDynamicSessionsRuntimeRef,
    commit_run_id: runId,
    release_candidate_ref_contract_status: releaseCandidateRefContractStatus,
    release_candidate_ref_contract_reason_codes_json: JSON.stringify(reasonCodes),
    release_candidate_manifest_copy_path: copyPath
  });

  console.info(`Loaded release candidate contract for ${headSha}`);
  if (releaseCandidateRefContractStatus !== "pass") {
    throw createCcsError({
      code: "RCCONTRACT001",
      why: `Release candidate contract is ${releaseCandidateRefContractStatus}.`,
      fix: "All release candidate refs must be present and digest-pinned.",
      doCommands: [
        `cat ${copyPath}`,
        "verify RELEASE_CANDIDATE_* refs are digest-pinned",
        "rerun load-release-candidate-contract"
      ],
      ref: "docs/ccs.md#output-format"
    });
  }

  return { status: "pass", code: "RCCONTRACT000" };
}

void withCcsGuardrail({
  guardrailId: "release-candidate.contract-load",
  command: "node scripts/pipeline/shared/load-release-candidate-contract.mjs",
  passCode: "RCCONTRACT000",
  passRef: "docs/ccs.md#output-format",
  run: main,
  mapError: (error) => ({
    code: "CCS_UNEXPECTED_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve release-candidate contract loading errors.",
    doCommands: ["node scripts/pipeline/shared/load-release-candidate-contract.mjs"],
    ref: "docs/ccs.md#output-format"
  })
});
