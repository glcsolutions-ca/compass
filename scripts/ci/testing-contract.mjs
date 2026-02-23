import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { appendGithubStepSummary, getCurrentSha, writeJsonFile } from "./utils.mjs";

const execFileAsync = promisify(execFile);

const TESTING_DOC = "tests/README.md";
const QUARANTINE_PATH = "tests/quarantine.json";

const LAYER_GLOBS = {
  "commit-stage": [
    "apps/*/src/**/*.test.ts",
    "apps/*/src/**/*.test.tsx",
    "packages/*/src/**/*.test.ts",
    "packages/*/src/**/*.test.tsx"
  ],
  integration: ["apps/*/test/integration/**/*.test.ts", "apps/*/test/integration/**/*.test.tsx"],
  e2e: ["tests/e2e/**/*.spec.ts", "tests/e2e/**/*.spec.tsx"],
  smoke: ["tests/smoke/**/*.ts", "tests/smoke/**/*.tsx"]
};

const DB_IMPORT_PATTERN =
  /(?:from\s*["'](?:pg|@prisma\/client|mysql2|mongodb|redis|ioredis|better-sqlite3)["']|require\(\s*["'](?:pg|@prisma\/client|mysql2|mongodb|redis|ioredis|better-sqlite3)["']\s*\))/;
const PLAYWRIGHT_IMPORT_PATTERN =
  /(?:from\s*["']@playwright\/test["']|require\(\s*["']@playwright\/test["']\s*\))/;
const ONLY_PATTERN = /\b(?:it|test|describe)\.only\s*\(/;
const SKIP_PATTERN = /\b(?:it|test|describe)\.skip\s*\(/;

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function matchesGlob(filePath, pattern) {
  return path.posix.matchesGlob(normalizePath(filePath), pattern);
}

function matchesAnyGlob(filePath, patterns) {
  return patterns.some((pattern) => matchesGlob(filePath, pattern));
}

function isCandidateTestFile(filePath) {
  const normalized = normalizePath(filePath);
  if (/\.(test|spec)\.tsx?$/.test(normalized)) {
    return true;
  }

  return matchesAnyGlob(normalized, LAYER_GLOBS.smoke);
}

function classifyLayer(filePath) {
  const layers = Object.entries(LAYER_GLOBS)
    .filter(([, patterns]) => matchesAnyGlob(filePath, patterns))
    .map(([layer]) => layer);

  return [...new Set(layers)];
}

function findLineMatches(content, pattern) {
  const matches = [];
  const lines = content.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      matches.push(index + 1);
    }
  }

  return matches;
}

async function listTrackedSourceFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files", "--", "apps", "packages", "tests"], {
    encoding: "utf8"
  });

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => normalizePath(line));
}

async function readFileIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function parseExpiryDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getSkipKey(filePath, line) {
  return `${normalizePath(filePath)}:${line}`;
}

function toQuarantineMatchKey(entry) {
  if (typeof entry.id === "string" && entry.id.trim().length > 0) {
    return entry.id.trim();
  }

  if (typeof entry.file === "string" && Number.isInteger(entry.line)) {
    return getSkipKey(entry.file, entry.line);
  }

  if (typeof entry.file === "string" && entry.file.trim().length > 0) {
    return `${normalizePath(entry.file)}:*`;
  }

  return null;
}

function validateQuarantineEntry(entry, index) {
  const entryPath = `${QUARANTINE_PATH}:entries[${index}]`;

  if (!entry || typeof entry !== "object") {
    return { valid: false, error: `${entryPath} must be an object` };
  }

  if (typeof entry.owner !== "string" || entry.owner.trim().length === 0) {
    return { valid: false, error: `${entryPath}.owner is required` };
  }

  if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
    return { valid: false, error: `${entryPath}.reason is required` };
  }

  if (!parseExpiryDate(entry.expiresOn)) {
    return { valid: false, error: `${entryPath}.expiresOn must be YYYY-MM-DD` };
  }

  if (
    typeof entry.id !== "string" &&
    !(typeof entry.file === "string" && entry.file.trim().length > 0)
  ) {
    return {
      valid: false,
      error: `${entryPath} must include either id or file`
    };
  }

  if (entry.line !== undefined && (!Number.isInteger(entry.line) || entry.line <= 0)) {
    return { valid: false, error: `${entryPath}.line must be a positive integer when provided` };
  }

  return { valid: true };
}

function createViolation({ ruleId, title, file, line, why, fix, see }) {
  return {
    ruleId,
    title,
    file: normalizePath(file),
    line,
    why,
    fix,
    see
  };
}

function formatViolation(violation) {
  const output = [];
  output.push(`✗ ${violation.ruleId} ${violation.title}`);
  output.push(`  Found: ${violation.file}${violation.line ? `:${violation.line}` : ""}`);
  output.push(`  Why: ${violation.why}`);
  output.push("  Fix:");

  for (const step of violation.fix) {
    output.push(`    ${step}`);
  }

  output.push(`  See: ${violation.see}`);
  return output.join("\n");
}

async function loadQuarantineEntries(violations) {
  const raw = await readFileIfExists(QUARANTINE_PATH);
  if (!raw) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    violations.push(
      createViolation({
        ruleId: "TC011",
        title: "Quarantine file must contain valid JSON",
        file: QUARANTINE_PATH,
        why: "Malformed quarantine metadata can hide skipped tests.",
        fix: [
          `Fix ${QUARANTINE_PATH} JSON syntax or replace it with an empty entries array.`,
          'Example: {"schemaVersion":"1","entries":[]}'
        ],
        see: `${TESTING_DOC}#flake-policy`
      })
    );

    return [];
  }

  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const now = new Date();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const validation = validateQuarantineEntry(entry, index);

    if (!validation.valid) {
      violations.push(
        createViolation({
          ruleId: "TC011",
          title: "Quarantine entry is invalid",
          file: QUARANTINE_PATH,
          why: "Skip quarantines must include owner, reason, and expiry.",
          fix: [validation.error, `Update ${QUARANTINE_PATH} to satisfy the schema.`],
          see: `${TESTING_DOC}#flake-policy`
        })
      );
      continue;
    }

    const expiry = parseExpiryDate(entry.expiresOn);
    if (expiry && expiry.getTime() < now.getTime()) {
      violations.push(
        createViolation({
          ruleId: "TC011",
          title: "Quarantine entry is expired",
          file: QUARANTINE_PATH,
          why: "Expired quarantines create permanent skip rot.",
          fix: [
            `Remove or update entries[${index}] in ${QUARANTINE_PATH}.`,
            "Either unskip/fix the test now, or set a new explicit expiry and reason."
          ],
          see: `${TESTING_DOC}#flake-policy`
        })
      );
    }
  }

  return entries;
}

function hasMatchingQuarantineEntry(skipRecord, quarantineEntries) {
  const exactKey = getSkipKey(skipRecord.file, skipRecord.line);
  const anyLineKey = `${normalizePath(skipRecord.file)}:*`;

  return quarantineEntries.some((entry) => {
    const key = toQuarantineMatchKey(entry);
    if (!key) {
      return false;
    }

    if (key === exactKey || key === anyLineKey) {
      return true;
    }

    if (
      typeof entry.file === "string" &&
      normalizePath(entry.file) === normalizePath(skipRecord.file)
    ) {
      if (entry.line === undefined) {
        return true;
      }
      return entry.line === skipRecord.line;
    }

    return false;
  });
}

function inferIntegrationMovePath(filePath) {
  const normalized = normalizePath(filePath);
  const segments = normalized.split("/");
  const appName = segments[1] ?? "app";
  const baseName = path.posix.basename(normalized);
  return {
    mkdirPath: `apps/${appName}/test/integration`,
    movedPath: `apps/${appName}/test/integration/${baseName}`
  };
}

async function main() {
  const headSha = (process.env.HEAD_SHA || "").trim() || (await getCurrentSha());
  const testedSha = (process.env.TESTED_SHA || "").trim() || headSha;

  const trackedFiles = await listTrackedSourceFiles();
  const candidateTestFiles = trackedFiles.filter(isCandidateTestFile);
  const violations = [];
  const skipRecords = [];

  for (const filePath of candidateTestFiles) {
    const layers = classifyLayer(filePath);
    if (layers.length !== 1) {
      violations.push(
        createViolation({
          ruleId: "TC001",
          title: "Test file must map to exactly one testing layer",
          file: filePath,
          why: "Path-based layering keeps commit-stage deterministic and cheap.",
          fix: [
            "Place the test in one canonical layer path:",
            "- apps/**/src/**/*.test.ts(x) or packages/**/src/**/*.test.ts(x) for commit-stage",
            "- apps/**/test/integration/**/*.test.ts for integration",
            "- tests/e2e/**/*.spec.ts for Playwright",
            "- tests/smoke/**/*.ts for smoke/system"
          ],
          see: `${TESTING_DOC}#directory-conventions`
        })
      );
    }

    const content = await readFile(filePath, "utf8");

    const onlyLines = findLineMatches(content, ONLY_PATTERN);
    for (const line of onlyLines) {
      violations.push(
        createViolation({
          ruleId: "TC010",
          title: "Focused tests (*.only) are forbidden",
          file: filePath,
          line,
          why: "Focused tests hide failures and invalidate release evidence.",
          fix: [
            `Remove .only from ${filePath}:${line}.`,
            "Run pnpm test to confirm the full suite still passes."
          ],
          see: `${TESTING_DOC}#principles`
        })
      );
    }

    const skipLines = findLineMatches(content, SKIP_PATTERN);
    for (const line of skipLines) {
      skipRecords.push({ file: filePath, line });
    }

    if (PLAYWRIGHT_IMPORT_PATTERN.test(content) && !matchesAnyGlob(filePath, LAYER_GLOBS.e2e)) {
      const fileName = path.posix.basename(filePath).replace(/\.test\./, ".spec.");
      violations.push(
        createViolation({
          ruleId: "TC020",
          title: "Playwright tests must live under tests/e2e/",
          file: filePath,
          why: "E2E/browser checks are isolated from commit-stage suites.",
          fix: ["mkdir -p tests/e2e", `git mv ${filePath} tests/e2e/${fileName}`],
          see: `${TESTING_DOC}#directory-conventions`
        })
      );
    }

    if (DB_IMPORT_PATTERN.test(content) && !matchesAnyGlob(filePath, LAYER_GLOBS.integration)) {
      const move = inferIntegrationMovePath(filePath);
      violations.push(
        createViolation({
          ruleId: "TC020",
          title: "Integration tests must live under apps/**/test/integration/",
          file: filePath,
          why: "Commit-stage tests must remain hermetic and avoid real DB usage.",
          fix: ["mkdir -p " + move.mkdirPath, `git mv ${filePath} ${move.movedPath}`],
          see: `${TESTING_DOC}#4-integration-tests-some-high-value`
        })
      );
    }
  }

  const quarantineEntries = await loadQuarantineEntries(violations);

  for (const record of skipRecords) {
    if (!hasMatchingQuarantineEntry(record, quarantineEntries)) {
      violations.push(
        createViolation({
          ruleId: "TC011",
          title: "Skipped tests require explicit quarantine metadata",
          file: record.file,
          line: record.line,
          why: "Untracked skips create silent reliability regressions.",
          fix: [
            `Add an entry for ${getSkipKey(record.file, record.line)} in ${QUARANTINE_PATH}.`,
            "Required fields: owner, reason, expiresOn (YYYY-MM-DD).",
            "Or remove .skip and re-enable the test."
          ],
          see: `${TESTING_DOC}#flake-policy`
        })
      );
    }
  }

  const status = violations.length > 0 ? "fail" : "pass";
  const resultPath = path.join(".artifacts", "testing-contract", testedSha, "result.json");

  await writeJsonFile(resultPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    testedSha,
    status,
    scannedFileCount: candidateTestFiles.length,
    violationCount: violations.length,
    violations
  });

  const summaryLines = [
    "## Testing Contract",
    `- Status: ${status === "pass" ? "pass" : "fail"}`,
    `- Scanned test files: ${candidateTestFiles.length}`,
    `- Violations: ${violations.length}`,
    `- Artifact: ${resultPath}`
  ];

  if (violations.length > 0) {
    summaryLines.push("- Top findings:");
    for (const violation of violations.slice(0, 20)) {
      summaryLines.push(
        `  - ${violation.ruleId} ${violation.file}${violation.line ? `:${violation.line}` : ""}`
      );
    }
  }

  await appendGithubStepSummary(summaryLines.join("\n"));

  if (violations.length > 0) {
    console.error("Testing contract violations detected:");
    for (const violation of violations) {
      console.error(formatViolation(violation));
    }
    process.exit(1);
  }

  console.info(
    `Testing contract passed (${candidateTestFiles.length} files scanned). Artifact: ${resultPath}`
  );
}

void main();
