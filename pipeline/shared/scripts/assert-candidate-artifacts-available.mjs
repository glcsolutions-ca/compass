import { spawnSync } from "node:child_process";
import { readJsonFile } from "./pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "./validate-release-candidate.mjs";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${result.stderr || result.stdout || ""}`
    );
  }
}

function readArtifactRefs(manifest) {
  return [
    ["apiImage", manifest.artifacts.apiImage],
    ["webImage", manifest.artifacts.webImage],
    ["workerImage", manifest.artifacts.workerImage],
    ["migrationsArtifact", manifest.artifacts.migrationsArtifact]
  ];
}

export async function assertCandidateArtifactsAvailable(manifestPath) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed:\n${details}`);
  }

  run("oras", ["version"]);

  const manifest = await readJsonFile(manifestPath);
  for (const [label, reference] of readArtifactRefs(manifest)) {
    run("oras", ["manifest", "fetch", "--descriptor", reference]);
    console.info(`Resolved artifact ${label}: ${reference}`);
  }
}
