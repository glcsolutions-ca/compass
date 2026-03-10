import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs } from "../../../shared/scripts/cli-utils.mjs";
import { createReleaseCandidate } from "./generate-release-candidate.mjs";
import {
  buildCandidateId,
  readJsonFile,
  writeJsonFile
} from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { runCommand, runCommandCapture, runCommandCaptureStrict } from "../../../shared/scripts/command-runner.mjs";
import { validateReleaseCandidateRuntimeDocument } from "../../../shared/scripts/validate-release-candidate-runtime.mjs";

const LOCAL_REGISTRY_HOST = "127.0.0.1:5000";
const LOCAL_REGISTRY_CONTAINER = "compass-local-candidate-registry";
const LOCAL_VERIFY_DIR = path.resolve(".artifacts/verify");
const LOCAL_VERIFY_MANIFEST_PATH = path.join(LOCAL_VERIFY_DIR, "release-candidate.json");

async function waitForLocalRegistry() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${LOCAL_REGISTRY_HOST}/v2/`);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for local registry ${LOCAL_REGISTRY_HOST}`);
}

async function ensureLocalRegistry() {
  const inspection = runCommandCapture("docker", [
    "container",
    "inspect",
    LOCAL_REGISTRY_CONTAINER,
    "--format",
    "{{.State.Running}}"
  ]);

  if (inspection.status === 0 && inspection.stdout.trim() === "true") {
    await waitForLocalRegistry();
    return;
  }

  if (inspection.status === 0) {
    await runCommand("docker", ["start", LOCAL_REGISTRY_CONTAINER]);
    await waitForLocalRegistry();
    return;
  }

  await runCommand("docker", [
    "run",
    "-d",
    "--name",
    LOCAL_REGISTRY_CONTAINER,
    "-p",
    "127.0.0.1:5000:5000",
    "registry:2"
  ]);
  await waitForLocalRegistry();
}

function buildLocalCandidateRef(imageName, candidateId) {
  return `${LOCAL_REGISTRY_HOST}/${imageName}:${candidateId}`;
}

function resolveRepoDigest(reference) {
  const tagSeparator = reference.lastIndexOf(":");
  const repositoryRef = tagSeparator >= 0 ? reference.slice(0, tagSeparator) : reference;
  const output = runCommandCaptureStrict("docker", [
    "image",
    "inspect",
    reference,
    "--format",
    "{{range .RepoDigests}}{{println .}}{{end}}"
  ]);

  const digestRef = output
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${repositoryRef}@sha256:`));

  if (!digestRef) {
    throw new Error(`Unable to resolve digest-pinned reference for ${reference}`);
  }

  return digestRef;
}

async function buildAndPushImage({ imageName, dockerfile, candidateId }) {
  const reference = buildLocalCandidateRef(imageName, candidateId);
  await runCommand("docker", ["build", "--file", dockerfile, "--tag", reference, "."]);
  await runCommand("docker", ["push", reference]);
  return resolveRepoDigest(reference);
}

function buildLocalCommitRunId(sourceRevision) {
  const digest = createHash("sha256").update(sourceRevision).digest("hex");
  return String(BigInt(`0x${digest.slice(0, 15)}`));
}

export async function prepareLocalCandidate({
  rootDir = process.cwd(),
  forceRebuild = false
} = {}) {
  const sourceRevision = runCommandCaptureStrict("git", ["rev-parse", "HEAD"], { cwd: rootDir });
  const workingTreeDirty = runCommandCaptureStrict("git", ["status", "--porcelain"], {
    cwd: rootDir
  }).trim().length > 0;

  if (!forceRebuild && !workingTreeDirty) {
    try {
      const existing = await readJsonFile(LOCAL_VERIFY_MANIFEST_PATH);
      if (existing?.source?.revision === sourceRevision) {
        return {
          manifestPath: LOCAL_VERIFY_MANIFEST_PATH,
          candidateId: existing.candidateId,
          sourceRevision,
          artifactsDir: LOCAL_VERIFY_DIR
        };
      }
    } catch {}
  }

  await mkdir(LOCAL_VERIFY_DIR, { recursive: true });
  await ensureLocalRegistry();

  const candidateId = buildCandidateId(sourceRevision);
  const [apiImageRef, webImageRef] = await Promise.all([
    buildAndPushImage({
      imageName: "compass-api",
      dockerfile: "apps/api/Dockerfile",
      candidateId
    }),
    buildAndPushImage({
      imageName: "compass-web",
      dockerfile: "apps/web/Dockerfile",
      candidateId
    })
  ]);

  const manifest = createReleaseCandidate({
    repository: "local/compass",
    sourceRevision,
    apiImage: apiImageRef,
    webImage: webImageRef,
    registry: LOCAL_REGISTRY_HOST,
    commitStageRunId: buildLocalCommitRunId(sourceRevision)
  });

  const errors = validateReleaseCandidateRuntimeDocument(manifest);
  if (errors.length > 0) {
    throw new Error(
      `Generated local candidate is invalid:\n${errors
        .map((entry) => `- ${entry.path}: ${entry.message}`)
        .join("\n")}`
    );
  }

  await writeJsonFile(LOCAL_VERIFY_MANIFEST_PATH, manifest);

  return {
    manifestPath: LOCAL_VERIFY_MANIFEST_PATH,
    candidateId,
    sourceRevision,
    artifactsDir: LOCAL_VERIFY_DIR
  };
}

export function buildDiagnosticsPath(name) {
  return path.join(LOCAL_VERIFY_DIR, name);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const forceRebuild = options["force-rebuild"] === true;
  const candidate = await prepareLocalCandidate({ forceRebuild });
  process.stdout.write(`${JSON.stringify(candidate, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
