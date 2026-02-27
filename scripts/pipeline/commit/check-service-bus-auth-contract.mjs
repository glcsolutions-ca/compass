import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createCcsError, withCcsGuardrail } from "../shared/ccs-contract.mjs";

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
    let content;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

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
    throw createCcsError({
      code: "SB001",
      why: `Legacy Service Bus connection string references detected (${violations.length} files).`,
      fix: "Use managed identity Service Bus contract across runtime and pipeline paths.",
      doCommands: ["pnpm ci:service-bus-auth-contract", "pnpm test:quick"],
      ref: "docs/commit-stage-policy.md"
    });
  }

  console.info(
    `Service Bus managed identity contract passed (${filesToScan.length} files scanned).`
  );
  return { status: "pass", code: "SB000" };
}

void withCcsGuardrail({
  guardrailId: "service-bus.auth-contract",
  command: "pnpm ci:service-bus-auth-contract",
  passCode: "SB000",
  passRef: "docs/commit-stage-policy.md",
  run: main,
  mapError: (error) => ({
    code: "CCS_UNEXPECTED_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve Service Bus contract runtime errors and rerun the guardrail.",
    doCommands: ["pnpm ci:service-bus-auth-contract"],
    ref: "docs/ccs.md#output-format"
  })
});
