import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdtemp, readdir, copyFile, rm, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { parseCliArgs, requireOption } from "./cli-utils.mjs";
import { PATTERNS } from "./pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "./validate-release-candidate.mjs";

function run(command, args, { cwd } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${result.stderr || result.stdout || ""}`
    );
  }
  return result;
}

async function collectFilesRecursive(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFilesRecursive(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function resolvePulledManifestPath(directory) {
  const preferredPath = path.join(directory, "manifest.json");
  try {
    await access(preferredPath);
    return preferredPath;
  } catch {}

  const files = await collectFilesRecursive(directory);
  if (files.length === 0) {
    throw new Error(`No files found in pulled artifact directory: ${directory}`);
  }

  const namedManifest = files.find((filePath) => path.basename(filePath) === "manifest.json");
  if (namedManifest) {
    return namedManifest;
  }

  for (const candidatePath of files) {
    try {
      const errors = await validateReleaseCandidateFile(candidatePath);
      if (errors.length === 0) {
        return candidatePath;
      }
    } catch {}
  }

  throw new Error(`No valid release candidate manifest found in pulled artifact: ${directory}`);
}

export async function fetchReleaseCandidate(candidateId, outPath, registryRepo) {
  if (!PATTERNS.candidateId.test(candidateId)) {
    throw new Error(`Invalid candidate id: ${candidateId}`);
  }

  run("oras", ["version"]);
  const workingDirectory = await mkdtemp(path.join(os.tmpdir(), "compass-rc-"));

  try {
    const reference = `${registryRepo}:${candidateId}`;
    run("oras", ["pull", reference, "-o", workingDirectory]);
    const sourceManifest = await resolvePulledManifestPath(workingDirectory);
    await copyFile(sourceManifest, outPath);
    const errors = await validateReleaseCandidateFile(outPath);
    if (errors.length > 0) {
      throw new Error(
        `Fetched manifest failed validation:\n${errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n")}`
      );
    }
    return outPath;
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const candidateId = requireOption(options, "candidate-id");
  const outPath = requireOption(options, "out");
  const registryRepo = requireOption(options, "registry-repo");
  await fetchReleaseCandidate(candidateId, outPath, registryRepo);
  console.info(`Fetched release candidate '${candidateId}' to ${path.resolve(outPath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
