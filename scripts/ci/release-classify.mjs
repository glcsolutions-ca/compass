import path from "node:path";
import { appendGithubOutput, getChangedFiles, getCurrentSha, getParentSha } from "./utils.mjs";

const RUNTIME_PATTERNS = [
  "apps/**",
  "packages/**",
  "migrations/**",
  "scripts/db/**",
  "apps/api/Dockerfile",
  "apps/web/Dockerfile",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "**/package.json"
];

const INFRA_PATTERNS = ["infra/azure/**"];

const CHECKS_ONLY_PATTERNS = [
  "docs/**",
  "README.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  ".github/workflows/**",
  ".github/policy/**",
  "scripts/ci/**"
];

const INFRA_ROLLOUT_PATTERNS = [
  "infra/azure/main.bicep",
  "infra/azure/modules/containerapp-*.bicep",
  "infra/azure/modules/containerapps-env.bicep",
  "infra/azure/environments/*.bicepparam",
  "infra/azure/environments/**"
];

const MIGRATION_PATTERNS = ["migrations/**", "scripts/db/**"];

function matchesAny(filePath, patterns) {
  const normalized = filePath.replaceAll("\\", "/");
  return patterns.some((pattern) => path.posix.matchesGlob(normalized, pattern));
}

function allMatch(files, patterns) {
  return files.length > 0 && files.every((filePath) => matchesAny(filePath, patterns));
}

async function main() {
  const headSha = process.env.HEAD_SHA?.trim() || (await getCurrentSha());
  let baseSha = process.env.BASE_SHA?.trim();

  if (!baseSha || baseSha === "0000000000000000000000000000000000000000") {
    baseSha = await getParentSha(headSha);
  }

  const changedFiles = await getChangedFiles(baseSha, headSha);
  const touchesRuntime = changedFiles.some((filePath) => matchesAny(filePath, RUNTIME_PATTERNS));
  const touchesInfra = changedFiles.some((filePath) => matchesAny(filePath, INFRA_PATTERNS));
  const touchesMigration = changedFiles.some((filePath) =>
    matchesAny(filePath, MIGRATION_PATTERNS)
  );
  const checksOnly = allMatch(changedFiles, CHECKS_ONLY_PATTERNS);

  let kind = "runtime";
  if (!touchesRuntime && touchesInfra) {
    kind = "infra";
  } else if (!touchesRuntime && !touchesInfra && checksOnly) {
    kind = "checks";
  }

  const rollout =
    kind === "infra" &&
    changedFiles.some((filePath) => matchesAny(filePath, INFRA_ROLLOUT_PATTERNS));
  const needsInfra = kind === "runtime" && touchesInfra;
  const needsMigrations = kind === "runtime" && touchesMigration;

  await appendGithubOutput({
    base_sha: baseSha,
    kind,
    rollout: String(rollout),
    needs_infra: String(needsInfra),
    needs_migrations: String(needsMigrations),
    changed_files_json: JSON.stringify(changedFiles)
  });

  console.info(
    `release-classify: kind=${kind} rollout=${rollout} needsInfra=${needsInfra} needsMigrations=${needsMigrations} changed=${changedFiles.length}`
  );
}

void main();
