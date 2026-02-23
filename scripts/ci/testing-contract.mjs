import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { appendGithubStepSummary, getCurrentSha, writeJsonFile } from "./utils.mjs";

const execFileAsync = promisify(execFile);

export const DEFAULT_TEST_POLICY_PATH = path.join("tests", "policy", "test-policy.json");
export const DEPRECATED_QUARANTINE_PATH = path.join("tests", "quarantine.json");

export const REQUIRED_TEST_RULE_IDS = ["TC001", "TC010", "TC011", "TC020"];
export const REQUIRED_TEST_LAYER_KEYS = ["commitStage", "integration", "e2e", "smoke"];
export const REQUIRED_TEST_DOC_KEYS = [
  "principles",
  "directoryConventions",
  "flakePolicy",
  "integrationLayer"
];

const ONLY_PATTERN = /\b(?:it|test|describe)\.only\s*\(/;
const SKIP_PATTERN = /\b(?:it|test|describe)\.skip\s*\(/;

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function assertStringArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string" || value[index].trim().length === 0) {
      throw new Error(`${name}[${index}] must be a non-empty string`);
    }
  }
}

export function assertTestingPolicyShape(policy) {
  assertObject(policy, "Test policy");

  if (policy.schemaVersion !== "1") {
    throw new Error('test policy schemaVersion must be "1"');
  }

  assertStringArray(policy.scanRoots, "test policy scanRoots");

  assertObject(policy.layers, "test policy layers");
  for (const layerKey of REQUIRED_TEST_LAYER_KEYS) {
    assertStringArray(policy.layers[layerKey], `test policy layers.${layerKey}`);
  }

  assertObject(policy.imports, "test policy imports");
  assertStringArray(policy.imports.playwrightModules, "test policy imports.playwrightModules");
  assertStringArray(policy.imports.dbModules, "test policy imports.dbModules");

  assertObject(policy.paths, "test policy paths");
  assertString(policy.paths.quarantine, "test policy paths.quarantine");

  assertObject(policy.docs, "test policy docs");
  for (const docKey of REQUIRED_TEST_DOC_KEYS) {
    const link = assertString(policy.docs[docKey], `test policy docs.${docKey}`);
    if (!link.startsWith("tests/README.md#")) {
      throw new Error(`test policy docs.${docKey} must reference tests/README.md#...`);
    }
  }

  assertObject(policy.rules, "test policy rules");
  for (const ruleId of REQUIRED_TEST_RULE_IDS) {
    assertObject(policy.rules[ruleId], `test policy rules.${ruleId}`);
    if (typeof policy.rules[ruleId].enabled !== "boolean") {
      throw new Error(`test policy rules.${ruleId}.enabled must be a boolean`);
    }
  }
}

export function loadTestingPolicyObject(policy) {
  assertTestingPolicyShape(policy);
  return policy;
}

export async function loadTestingPolicy(policyPath = DEFAULT_TEST_POLICY_PATH) {
  let raw;
  try {
    raw = await readFile(policyPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read test policy at ${policyPath}: ${message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Test policy at ${policyPath} must be valid JSON: ${message}`);
  }

  return loadTestingPolicyObject(parsed);
}

export function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function matchesGlob(filePath, pattern) {
  return path.posix.matchesGlob(normalizePath(filePath), pattern);
}

export function matchesAnyGlob(filePath, patterns) {
  return patterns.some((pattern) => matchesGlob(filePath, pattern));
}

function resolveLayerGlobs(policy) {
  return [
    { layer: "commit-stage", patterns: policy.layers.commitStage },
    { layer: "integration", patterns: policy.layers.integration },
    { layer: "e2e", patterns: policy.layers.e2e },
    { layer: "smoke", patterns: policy.layers.smoke }
  ];
}

function classifyLayer(filePath, layerGlobs) {
  const layers = layerGlobs.filter((layer) => matchesAnyGlob(filePath, layer.patterns));
  return layers.map((layer) => layer.layer);
}

export function isCandidateTestFile(filePath, smokeGlobs) {
  const normalized = normalizePath(filePath);
  if (/\.(test|spec)\.tsx?$/.test(normalized)) {
    return true;
  }

  return matchesAnyGlob(normalized, smokeGlobs);
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

async function listTrackedSourceFiles(scanRoots) {
  const roots = scanRoots.map((root) => normalizePath(root));
  const { stdout } = await execFileAsync("git", ["ls-files", "--", ...roots], {
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

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function parseExpiryDate(value) {
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

export function validateQuarantineEntry(entry, index, quarantinePath) {
  const entryPath = `${quarantinePath}:entries[${index}]`;

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildModuleImportPattern(modules) {
  const escaped = modules.map((moduleName) => escapeRegex(moduleName));
  return new RegExp(
    `(?:from\\s*[\"'](?:${escaped.join("|")})[\"']|require\\(\\s*[\"'](?:${escaped.join("|")})[\"']\\s*\\))`
  );
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

export async function ensureNoDeprecatedQuarantinePath({
  legacyQuarantinePath = DEPRECATED_QUARANTINE_PATH,
  quarantinePath,
  docsLink,
  fileExistsFn = fileExists
}) {
  if (!(await fileExistsFn(legacyQuarantinePath))) {
    return null;
  }

  return createViolation({
    ruleId: "TC011",
    title: "Deprecated quarantine path is not allowed",
    file: legacyQuarantinePath,
    why: "Testing quarantine is policy-owned and must live at the configured policy path.",
    fix: [
      `Move entries from ${legacyQuarantinePath} to ${quarantinePath}.`,
      `Delete ${legacyQuarantinePath} after migration.`
    ],
    see: docsLink
  });
}

async function loadQuarantineEntries({ quarantinePath, docsLink, violations }) {
  const raw = await readFileIfExists(quarantinePath);
  if (!raw) {
    violations.push(
      createViolation({
        ruleId: "TC011",
        title: "Quarantine file is missing",
        file: quarantinePath,
        why: "Skip metadata must be explicit and machine-verifiable.",
        fix: [
          `mkdir -p ${path.posix.dirname(quarantinePath)}`,
          `Create ${quarantinePath} with: {"schemaVersion":"1","entries":[]}`
        ],
        see: docsLink
      })
    );
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
        file: quarantinePath,
        why: "Malformed quarantine metadata can hide skipped tests.",
        fix: [
          `Fix ${quarantinePath} JSON syntax or replace it with an empty entries array.`,
          'Example: {"schemaVersion":"1","entries":[]}'
        ],
        see: docsLink
      })
    );
    return [];
  }

  if (parsed?.schemaVersion !== "1") {
    violations.push(
      createViolation({
        ruleId: "TC011",
        title: 'Quarantine schemaVersion must be "1"',
        file: quarantinePath,
        why: "Quarantine metadata must follow the current schema contract.",
        fix: [`Set ${quarantinePath}.schemaVersion to \"1\".`],
        see: docsLink
      })
    );
  }

  if (!Array.isArray(parsed?.entries)) {
    violations.push(
      createViolation({
        ruleId: "TC011",
        title: "Quarantine entries must be an array",
        file: quarantinePath,
        why: "Skip metadata must be enumerable and validated.",
        fix: [`Set ${quarantinePath}.entries to an array.`],
        see: docsLink
      })
    );
    return [];
  }

  const entries = parsed.entries;
  const now = new Date();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const validation = validateQuarantineEntry(entry, index, quarantinePath);

    if (!validation.valid) {
      violations.push(
        createViolation({
          ruleId: "TC011",
          title: "Quarantine entry is invalid",
          file: quarantinePath,
          why: "Skip quarantines must include owner, reason, and expiry.",
          fix: [validation.error, `Update ${quarantinePath} to satisfy the schema.`],
          see: docsLink
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
          file: quarantinePath,
          why: "Expired quarantines create permanent skip rot.",
          fix: [
            `Remove or update entries[${index}] in ${quarantinePath}.`,
            "Either unskip/fix the test now, or set a new explicit expiry and reason."
          ],
          see: docsLink
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

export async function runTestingContract(options = {}) {
  const policyPath =
    options.policyPath ?? process.env.TEST_POLICY_PATH?.trim() ?? DEFAULT_TEST_POLICY_PATH;

  const policy = await loadTestingPolicy(policyPath);
  const layerGlobs = resolveLayerGlobs(policy);
  const quarantinePath = normalizePath(policy.paths.quarantine);

  const envHeadSha = (process.env.HEAD_SHA || "").trim();
  const envTestedSha = (process.env.TESTED_SHA || "").trim();
  const headShaCandidate = options.headSha ?? envHeadSha;
  const headSha = headShaCandidate || (await getCurrentSha());
  const testedShaCandidate = options.testedSha ?? envTestedSha;
  const testedSha = testedShaCandidate || headSha;

  const trackedFiles = await listTrackedSourceFiles(policy.scanRoots);
  const candidateTestFiles = trackedFiles.filter((filePath) =>
    isCandidateTestFile(filePath, policy.layers.smoke)
  );

  const violations = [];
  const skipRecords = [];
  const enabledRules = new Set(
    REQUIRED_TEST_RULE_IDS.filter((ruleId) => policy.rules[ruleId].enabled)
  );

  if (enabledRules.has("TC011")) {
    const deprecatedPathViolation = await ensureNoDeprecatedQuarantinePath({
      quarantinePath,
      docsLink: policy.docs.flakePolicy
    });

    if (deprecatedPathViolation) {
      violations.push(deprecatedPathViolation);
    }
  }

  const dbImportPattern = buildModuleImportPattern(policy.imports.dbModules);
  const playwrightImportPattern = buildModuleImportPattern(policy.imports.playwrightModules);

  for (const filePath of candidateTestFiles) {
    const layers = classifyLayer(filePath, layerGlobs);
    if (enabledRules.has("TC001") && layers.length !== 1) {
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
          see: policy.docs.directoryConventions
        })
      );
    }

    const content = await readFile(filePath, "utf8");

    if (enabledRules.has("TC010")) {
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
            see: policy.docs.principles
          })
        );
      }
    }

    if (enabledRules.has("TC011")) {
      const skipLines = findLineMatches(content, SKIP_PATTERN);
      for (const line of skipLines) {
        skipRecords.push({ file: filePath, line });
      }
    }

    if (enabledRules.has("TC020")) {
      if (playwrightImportPattern.test(content) && !matchesAnyGlob(filePath, policy.layers.e2e)) {
        const fileName = path.posix.basename(filePath).replace(/\.test\./, ".spec.");
        violations.push(
          createViolation({
            ruleId: "TC020",
            title: "Playwright tests must live under tests/e2e/",
            file: filePath,
            why: "E2E/browser checks are isolated from commit-stage suites.",
            fix: ["mkdir -p tests/e2e", `git mv ${filePath} tests/e2e/${fileName}`],
            see: policy.docs.directoryConventions
          })
        );
      }

      if (dbImportPattern.test(content) && !matchesAnyGlob(filePath, policy.layers.integration)) {
        const move = inferIntegrationMovePath(filePath);
        violations.push(
          createViolation({
            ruleId: "TC020",
            title: "Integration tests must live under apps/**/test/integration/",
            file: filePath,
            why: "Commit-stage tests must remain hermetic and avoid real DB usage.",
            fix: ["mkdir -p " + move.mkdirPath, `git mv ${filePath} ${move.movedPath}`],
            see: policy.docs.integrationLayer
          })
        );
      }
    }
  }

  if (enabledRules.has("TC011")) {
    const quarantineEntries = await loadQuarantineEntries({
      quarantinePath,
      docsLink: policy.docs.flakePolicy,
      violations
    });

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
              `Add an entry for ${getSkipKey(record.file, record.line)} in ${quarantinePath}.`,
              "Required fields: owner, reason, expiresOn (YYYY-MM-DD).",
              "Or remove .skip and re-enable the test."
            ],
            see: policy.docs.flakePolicy
          })
        );
      }
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
    policyPath: normalizePath(policyPath),
    quarantinePath,
    scannedFileCount: candidateTestFiles.length,
    violationCount: violations.length,
    violations
  });

  const summaryLines = [
    "## Testing Contract",
    `- Status: ${status}`,
    `- Policy: \`${normalizePath(policyPath)}\``,
    `- Quarantine: \`${quarantinePath}\``,
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

  return {
    status,
    headSha,
    testedSha,
    resultPath,
    policyPath: normalizePath(policyPath),
    quarantinePath,
    scannedFileCount: candidateTestFiles.length,
    violations
  };
}

export async function main() {
  const result = await runTestingContract();

  if (result.status === "fail") {
    console.error("Testing contract violations detected:");
    for (const violation of result.violations) {
      console.error(formatViolation(violation));
    }
    process.exit(1);
  }

  console.info(
    `Testing contract passed (${result.scannedFileCount} files scanned). Artifact: ${result.resultPath}`
  );
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
