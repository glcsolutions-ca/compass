import path from "node:path";
import { appendGithubOutput, readJsonFile, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

const DIGEST_PATTERN = /^.+@sha256:[a-fA-F0-9]{64}$/;

function asBoolean(value) {
  return value === true;
}

function deriveChangeClass({ changeClass, riskClass, scope, deploymentRequired }) {
  const explicit = String(changeClass || "").trim();
  if (explicit.length > 0) {
    return explicit;
  }

  if (riskClass === "high-risk") {
    if (asBoolean(scope?.infra)) {
      return "infra";
    }
    if (asBoolean(scope?.identity)) {
      return "identity";
    }
    return "runtime";
  }

  if (deploymentRequired) {
    return "runtime";
  }

  if (asBoolean(scope?.desktop)) {
    return "desktop";
  }

  return "checks";
}

async function main() {
  const manifestPath = requireEnv("RELEASE_CANDIDATE_MANIFEST_PATH");
  const runId = process.env.RUN_ID?.trim() || "";

  const manifest = await readJsonFile(manifestPath);
  if (String(manifest?.schemaVersion || "") !== "1") {
    throw new Error(`Unsupported release candidate schemaVersion: ${manifest?.schemaVersion}`);
  }

  const scope = manifest?.scope ?? {};
  const runtimeChanged = asBoolean(scope.runtime);
  const desktopChanged = asBoolean(scope.desktop);
  const infraChanged = asBoolean(manifest?.scope?.infra);
  const identityChanged = asBoolean(manifest?.scope?.identity);
  const docsOnlyChanged = asBoolean(manifest?.scope?.docsOnly);

  const deploymentRequired = asBoolean(manifest?.deploymentRequired);
  const riskClass = String(manifest?.riskClass || "none").trim() || "none";
  const changeClass = deriveChangeClass({
    changeClass: manifest?.changeClass,
    riskClass,
    scope,
    deploymentRequired
  });
  const requiresInfraConvergence =
    asBoolean(manifest?.requiresInfraConvergence) || infraChanged || identityChanged;
  const requiresMigrations = asBoolean(manifest?.requiresMigrations) || asBoolean(scope.migration);

  const releaseCandidateApiRef = String(manifest?.releaseCandidate?.apiRef || "");
  const releaseCandidateWebRef = String(manifest?.releaseCandidate?.webRef || "");
  const releaseCandidateWorkerRef = String(manifest?.releaseCandidate?.workerRef || "");
  const releaseCandidateDynamicSessionsRuntimeRef = String(
    manifest?.releaseCandidate?.dynamicSessionsRuntimeRef || ""
  );

  const predeployedRevisionsJson = JSON.stringify(manifest?.predeployedRevisions ?? null);
  const reasonCodes = [];
  const requiresReleasePackageRefs = deploymentRequired;

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
    deployment_required: String(deploymentRequired),
    risk_class: riskClass,
    requires_infra_convergence: String(requiresInfraConvergence),
    requires_migrations: String(requiresMigrations),
    release_candidate_api_ref: releaseCandidateApiRef,
    release_candidate_web_ref: releaseCandidateWebRef,
    release_candidate_worker_ref: releaseCandidateWorkerRef,
    release_candidate_dynamic_sessions_runtime_ref: releaseCandidateDynamicSessionsRuntimeRef,
    predeployed_revisions_json: predeployedRevisionsJson,
    commit_run_id: runId,
    acceptance_run_id: runId,
    release_candidate_ref_contract_status: releaseCandidateRefContractStatus,
    release_candidate_ref_contract_reason_codes_json: JSON.stringify(reasonCodes),
    release_candidate_manifest_copy_path: copyPath
  });

  console.info(`Loaded release candidate contract for ${headSha}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
