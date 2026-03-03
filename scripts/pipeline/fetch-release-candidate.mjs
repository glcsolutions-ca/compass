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

async function resolvePulledManifestPath(directory) {
  const preferredPath = path.join(directory, "manifest.json");

  try {
    await access(preferredPath);
    return preferredPath;
  } catch {
    // Fall through to generic discovery.
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());

  if (files.length === 0) {
    throw new Error(`No files found in pulled artifact directory: ${directory}`);
  }

  const manifest =
    files.find((entry) => entry.name === "manifest.json") ||
    files.find((entry) => entry.name.endsWith(".json")) ||
    files[0];
  return path.join(directory, manifest.name);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  const candidateId = requireOption(options, "candidate-id");
  const outPath = requireOption(options, "out");
  const registryRepo = requireOption(options, "registry-repo");

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
      const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
      throw new Error(`Fetched manifest failed validation:\n${details}`);
    }

    console.info(`Fetched release candidate '${candidateId}' to ${path.resolve(outPath)}`);
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
