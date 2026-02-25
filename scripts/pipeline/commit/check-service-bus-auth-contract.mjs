import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const blockedEnvName = ["AZURE", "SERVICE", "BUS", "CONNECTION", "STRING"].join("_");
const blockedBicepParameter = ["service", "Bus", "Connection", "String"].join("");

const INCLUDE_GLOBS = [
  ".github/workflows/cloud-deployment-pipeline.yml",
  ".github/workflows/cloud-deployment-pipeline-replay.yml",
  "scripts/pipeline/**",
  "infra/azure/**",
  "apps/worker/**"
];

const EXCLUDE_GLOBS = [
  "scripts/pipeline/commit/check-service-bus-auth-contract.mjs",
  "**/node_modules/**"
];

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function matchesAnyGlob(filePath, patterns) {
  const normalized = normalizePath(filePath);
  return patterns.some((pattern) => path.posix.matchesGlob(normalized, pattern));
}

async function listTrackedFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files"], { encoding: "utf8" });
  return stdout
    .split("\n")
    .map((line) => normalizePath(line.trim()))
    .filter((line) => line.length > 0);
}

async function main() {
  const trackedFiles = await listTrackedFiles();
  const filesToScan = trackedFiles.filter(
    (filePath) =>
      matchesAnyGlob(filePath, INCLUDE_GLOBS) && !matchesAnyGlob(filePath, EXCLUDE_GLOBS)
  );

  const violations = [];

  for (const filePath of filesToScan) {
    const content = await readFile(filePath, "utf8");
    if (content.includes(blockedEnvName) || content.includes(blockedBicepParameter)) {
      violations.push(filePath);
    }
  }

  if (violations.length > 0) {
    console.error("Service Bus managed identity contract violations detected:");
    for (const filePath of violations) {
      console.error(`- ${filePath}`);
    }
    console.error(
      `Remove legacy ${blockedEnvName} and ${blockedBicepParameter} references from active runtime/pipeline paths.`
    );
    process.exit(1);
  }

  console.info(
    `Service Bus managed identity contract passed (${filesToScan.length} files scanned).`
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
