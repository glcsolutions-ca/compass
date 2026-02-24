import path from "node:path";
import { appendGithubOutput, readJsonFile, requireEnv, writeJsonFile } from "./pipeline-utils.mjs";

const DIGEST_PATTERN = /^.+@sha256:[a-fA-F0-9]{64}$/;

function asBoolean(value) {
  return value === true;
}

async function main() {
  const manifestPath = requireEnv("RELEASE_PACKAGE_MANIFEST_PATH");
  const runId = process.env.RUN_ID?.trim() || "";

  const manifest = await readJsonFile(manifestPath);
  if (String(manifest?.schemaVersion || "") !== "1") {
    throw new Error(`Unsupported release package schemaVersion: ${manifest?.schemaVersion}`);
  }

  const runtimeChanged = asBoolean(manifest?.scope?.runtime);
  const desktopChanged = asBoolean(manifest?.scope?.desktop);
  const infraChanged = asBoolean(manifest?.scope?.infra);
  const identityChanged = asBoolean(manifest?.scope?.identity);
  const docsOnlyChanged = asBoolean(manifest?.scope?.docsOnly);

  const changeClass = String(manifest?.changeClass || "").trim();
  const requiresInfraConvergence = asBoolean(manifest?.requiresInfraConvergence);
  const requiresMigrations = asBoolean(manifest?.requiresMigrations);

  const releasePackageApiRef = String(manifest?.releasePackage?.apiRef || "");
  const releasePackageWebRef = String(manifest?.releasePackage?.webRef || "");
  const releasePackageCodexRef = String(manifest?.releasePackage?.codexRef || "");

  const reasonCodes = [];
  const requiresReleasePackageRefs = runtimeChanged || infraChanged || requiresInfraConvergence;

  if (requiresReleasePackageRefs) {
    if (!releasePackageApiRef) {
      reasonCodes.push("RELEASE_PACKAGE_API_REF_MISSING");
    }
    if (!releasePackageWebRef) {
      reasonCodes.push("RELEASE_PACKAGE_WEB_REF_MISSING");
    }
    if (!releasePackageCodexRef) {
      reasonCodes.push("RELEASE_PACKAGE_CODEX_REF_MISSING");
    }

    if (releasePackageApiRef && !DIGEST_PATTERN.test(releasePackageApiRef)) {
      reasonCodes.push("RELEASE_PACKAGE_API_REF_NOT_DIGEST");
    }
    if (releasePackageWebRef && !DIGEST_PATTERN.test(releasePackageWebRef)) {
      reasonCodes.push("RELEASE_PACKAGE_WEB_REF_NOT_DIGEST");
    }
    if (releasePackageCodexRef && !DIGEST_PATTERN.test(releasePackageCodexRef)) {
      reasonCodes.push("RELEASE_PACKAGE_CODEX_REF_NOT_DIGEST");
    }
  }

  const releasePackageRefContractStatus = reasonCodes.length === 0 ? "pass" : "fail";

  const headSha = String(manifest?.headSha || "").trim();
  if (!headSha) {
    throw new Error("Release package contract missing headSha");
  }
  if (!changeClass) {
    throw new Error("Release package contract missing changeClass");
  }
  const copyPath = path.join(".artifacts", "acceptance", headSha, "release-package-manifest.json");

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
    release_package_api_ref: releasePackageApiRef,
    release_package_web_ref: releasePackageWebRef,
    release_package_codex_ref: releasePackageCodexRef,
    commit_run_id: runId,
    release_package_ref_contract_status: releasePackageRefContractStatus,
    release_package_ref_contract_reason_codes_json: JSON.stringify(reasonCodes),
    release_package_manifest_copy_path: copyPath
  });

  console.info(`Loaded release package contract for ${headSha}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
