import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const TIER_ORDER = ["high", "standard", "low"];
export const KNOWN_CHECKS = [
  "risk-policy-gate",
  "preflight",
  "ci-pipeline",
  "browser-evidence",
  "harness-smoke",
  "migration-image-smoke"
];

export const KNOWN_CHECK_SET = new Set(KNOWN_CHECKS);
export const MIGRATION_IMAGE_SMOKE_PATHS = ["db/migrations/**", "db/scripts/**"];

export function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export async function execGit(args) {
  const { stdout } = await execFileAsync("git", args, { encoding: "utf8" });
  return stdout.trim();
}

export async function getCurrentSha() {
  return await execGit(["rev-parse", "HEAD"]);
}

export async function getParentSha(headSha) {
  return await execGit(["rev-parse", `${headSha}^`]);
}

export async function getChangedFiles(baseSha, headSha) {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", `${baseSha}...${headSha}`],
    {
      encoding: "utf8"
    }
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

export function matchesAnyPattern(filePath, patterns) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  return patterns.some((pattern) => path.posix.matchesGlob(normalizedPath, pattern));
}

export async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function appendGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await writeFile(outputPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "a" });
}

export async function appendGithubStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  await writeFile(summaryPath, `${markdown}\n`, { encoding: "utf8", flag: "a" });
}

export async function getPrNumberFromEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return null;
  }

  const payload = await readJsonFile(eventPath);
  return payload?.pull_request?.number ?? payload?.number ?? null;
}

export function loadMergePolicyObject(policy) {
  assertMergePolicyShape(policy);
  return policy;
}

export async function loadMergePolicy(
  policyPath = path.join(".github", "policy", "merge-policy.json")
) {
  const policy = await readJsonFile(policyPath);
  return loadMergePolicyObject(policy);
}

export function assertMergePolicyShape(policy) {
  const requiredTopLevel = [
    "version",
    "riskTierRules",
    "mergePolicy",
    "docsDriftRules",
    "uiEvidenceRules",
    "staleRules",
    "reviewPolicy"
  ];

  if (!policy || typeof policy !== "object") {
    throw new Error("Merge policy must be an object");
  }

  for (const key of requiredTopLevel) {
    if (!(key in policy)) {
      throw new Error(`Merge policy missing required field: ${key}`);
    }
  }

  for (const tier of TIER_ORDER) {
    const riskPatterns = policy.riskTierRules?.[tier];
    if (!Array.isArray(riskPatterns) || riskPatterns.length === 0) {
      throw new Error(`riskTierRules.${tier} must be a non-empty array`);
    }

    const merge = policy.mergePolicy?.[tier];
    if (!merge || !Array.isArray(merge.requiredChecks) || merge.requiredChecks.length === 0) {
      throw new Error(`mergePolicy.${tier}.requiredChecks must be a non-empty array`);
    }

    for (const check of merge.requiredChecks) {
      if (!KNOWN_CHECK_SET.has(check)) {
        throw new Error(`mergePolicy.${tier}.requiredChecks contains unknown check: ${check}`);
      }
    }
  }

  const docs = policy.docsDriftRules;
  if (
    !docs ||
    !Array.isArray(docs.blockingPaths) ||
    !Array.isArray(docs.docsCriticalPaths) ||
    !Array.isArray(docs.docTargets)
  ) {
    throw new Error("docsDriftRules.blockingPaths/docsCriticalPaths/docTargets must all be arrays");
  }

  const ui = policy.uiEvidenceRules;
  if (!ui || !Array.isArray(ui.paths) || !Array.isArray(ui.requiredFlowIds)) {
    throw new Error("uiEvidenceRules.paths and uiEvidenceRules.requiredFlowIds must be arrays");
  }

  const stale = policy.staleRules;
  if (
    !stale ||
    typeof stale.requireHeadShaMatch !== "boolean" ||
    typeof stale.requireTierMatch !== "boolean"
  ) {
    throw new Error(
      "staleRules.requireHeadShaMatch and staleRules.requireTierMatch must be booleans"
    );
  }

  const review = policy.reviewPolicy;
  if (!review || typeof review.codexReviewEnabled !== "boolean") {
    throw new Error("reviewPolicy.codexReviewEnabled must be a boolean");
  }
}

export function resolveRiskTier(policy, changedFiles) {
  for (const tier of TIER_ORDER) {
    const patterns = policy.riskTierRules[tier];
    if (changedFiles.some((filePath) => matchesAnyPattern(filePath, patterns))) {
      return tier;
    }
  }

  return "low";
}

export function requiresBrowserEvidence(policy, changedFiles) {
  return changedFiles.some((filePath) => matchesAnyPattern(filePath, policy.uiEvidenceRules.paths));
}

export function computeRequiredChecks(policy, tier, changedFiles) {
  const checks = new Set(policy.mergePolicy[tier].requiredChecks);

  if (requiresBrowserEvidence(policy, changedFiles)) {
    checks.add("browser-evidence");
  }

  if (!requiresMigrationImageSmoke(tier, changedFiles)) {
    checks.delete("migration-image-smoke");
  }

  return KNOWN_CHECKS.filter((name) => checks.has(name));
}

export function requiresMigrationImageSmoke(tier, changedFiles) {
  if (tier !== "high") {
    return false;
  }

  return changedFiles.some((filePath) => matchesAnyPattern(filePath, MIGRATION_IMAGE_SMOKE_PATHS));
}

export function evaluateDocsDrift(policy, changedFiles) {
  const blockingPathsChanged = changedFiles.filter((filePath) =>
    matchesAnyPattern(filePath, policy.docsDriftRules.blockingPaths)
  );

  const docsCriticalPathsChanged = changedFiles.filter((filePath) =>
    matchesAnyPattern(filePath, policy.docsDriftRules.docsCriticalPaths)
  );

  const touchedDocTargets = changedFiles.filter((filePath) =>
    matchesAnyPattern(filePath, policy.docsDriftRules.docTargets)
  );

  const expectedDocTargets = [...policy.docsDriftRules.docTargets];
  const touchesBlockingPaths = blockingPathsChanged.length > 0;
  const touchesDocsCriticalPaths = docsCriticalPathsChanged.length > 0;

  const docsUpdated = touchedDocTargets.length > 0;
  const shouldBlock = touchesDocsCriticalPaths && !docsUpdated;
  const reasonCodes = [];

  if (shouldBlock) {
    reasonCodes.push("DOCS_DRIFT_BLOCKING_DOC_TARGET_MISSING");
  } else if (touchesBlockingPaths && !docsUpdated) {
    reasonCodes.push("DOCS_DRIFT_ADVISORY_DOC_TARGET_MISSING");
  }

  return {
    touchesBlockingPaths,
    touchesDocsCriticalPaths,
    blockingPathsChanged,
    docsCriticalPathsChanged,
    docsUpdated,
    touchedDocTargets,
    expectedDocTargets,
    reasonCodes,
    shouldBlock
  };
}

export function parseJsonEnv(name, fallback = null) {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  return JSON.parse(raw);
}

export function parsePossiblyFencedJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) {
    return JSON.parse(trimmed);
  }

  const withoutFenceStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  const withoutFenceEnd = withoutFenceStart.replace(/\s*```\s*$/i, "");
  return JSON.parse(withoutFenceEnd);
}
