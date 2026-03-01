import { pathToFileURL } from "node:url";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = ".";
const MAX_LINES_EXCLUSIVE = 300;
const TARGET_LINES_IN_SCOPE = 120;
const CANONICAL_DOC_PATH = path.join("docs", "development-pipeline.md");
const FORBIDDEN_NAME_TOKENS = ["one-pager", "playbook", "notes", "vnext"];

const HISTORY_EXCLUDE = new Set([
  "docs/adr/README.md",
  "docs/adr/TDR-001-initial-stack-baseline.md",
  "docs/adr/TDR-002-production-container-registry-strategy.md",
  "docs/adr/TDR-003-cloud-deployment-pipeline-visualization-model.md",
  "docs/adr/TDR-004-cloud-deployment-pipeline-and-desktop-naming-followup.md",
  "docs/adr/TDR-005-entra-only-auth-v1-baseline.md",
  "docs/adr/TDR-006-compass-chat-prompt-history-ux.md",
  "docs/adr/TDR-006-frontend-constitution-v1.md",
  "docs/adr/TDR-007-compass-chat-dictation-ux.md",
  "docs/runbooks/auth-testing-redesign-journal.md",
  "docs/runbooks/cloud-pipeline-farley-decision-log.md",
  "docs/runbooks/cloud-pipeline-farley-review.md",
  "docs/runbooks/test-quick-farley-assessment.md"
]);

const IGNORE_DIRS = new Set(["node_modules", ".git", ".turbo"]);

const MARKDOWN_LINK_REGEX = /\[[^\]]+\]\(([^)]+)\)/g;

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) {
        continue;
      }

      files.push(...(await listMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(normalizePath(fullPath).replace(/^\.\//, ""));
    }
  }

  return files.sort();
}

function countLines(text) {
  if (text.length === 0) {
    return 0;
  }

  return text.split(/\r?\n/).length;
}

function shouldSkipLinkTarget(target) {
  const lowered = target.toLowerCase();

  return (
    target.startsWith("#") ||
    target.startsWith("/") ||
    lowered.startsWith("http://") ||
    lowered.startsWith("https://") ||
    lowered.startsWith("mailto:") ||
    lowered.startsWith("tel:") ||
    lowered.startsWith("data:") ||
    lowered.startsWith("app://") ||
    lowered.startsWith("file://")
  );
}

function sanitizeLinkTarget(rawTarget) {
  const trimmed = rawTarget.trim().replace(/^<|>$/g, "");
  const linkPart = trimmed.split(/\s+/)[0] ?? "";
  const noHash = linkPart.split("#")[0] ?? "";
  const noQuery = noHash.split("?")[0] ?? "";
  return noQuery.trim();
}

async function validateRelativeLinks({ filePath, content }) {
  const violations = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const matches = line.matchAll(MARKDOWN_LINK_REGEX);

    for (const match of matches) {
      const rawTarget = String(match[1] ?? "").trim();
      const target = sanitizeLinkTarget(rawTarget);
      if (!target || shouldSkipLinkTarget(target)) {
        continue;
      }

      const resolved = normalizePath(path.resolve(path.dirname(filePath), target));
      const resolvedFromRepo = normalizePath(path.resolve(REPO_ROOT, target));

      const exists =
        (await pathExists(resolved)) ||
        (await pathExists(`${resolved}.md`)) ||
        (await pathExists(resolvedFromRepo)) ||
        (await pathExists(`${resolvedFromRepo}.md`));

      if (!exists) {
        violations.push({
          code: "DOCQ006",
          filePath,
          line: i + 1,
          message: `Relative markdown link target does not resolve: ${rawTarget}`
        });
      }
    }
  }

  return violations;
}

function isInScope(filePath) {
  return !HISTORY_EXCLUDE.has(normalizePath(filePath));
}

export async function evaluateDocQuality({
  rootDir = REPO_ROOT,
  canonicalDocPath = CANONICAL_DOC_PATH,
  maxLinesExclusive = MAX_LINES_EXCLUSIVE,
  targetLinesInScope = TARGET_LINES_IN_SCOPE
} = {}) {
  const violations = [];

  if (!(await pathExists(canonicalDocPath))) {
    violations.push({
      code: "DOCQ001",
      filePath: canonicalDocPath,
      message: `Canonical pipeline doc is required at ${canonicalDocPath}.`
    });
  }

  const markdownFiles = await listMarkdownFiles(rootDir);
  let inScopeCount = 0;

  for (const filePath of markdownFiles) {
    const content = await readFile(filePath, "utf8");
    const lineCount = countLines(content);

    if (lineCount >= maxLinesExclusive) {
      violations.push({
        code: "DOCQ002",
        filePath,
        message: `Markdown files must stay below ${maxLinesExclusive} lines (found ${lineCount}).`
      });
    }

    if (!isInScope(filePath)) {
      continue;
    }

    inScopeCount += 1;

    if (lineCount > targetLinesInScope) {
      violations.push({
        code: "DOCQ005",
        filePath,
        message: `In-scope markdown files must stay at or below ${targetLinesInScope} lines (found ${lineCount}).`
      });
    }

    const fileName = path.basename(filePath).toLowerCase();
    for (const token of FORBIDDEN_NAME_TOKENS) {
      if (!fileName.includes(token)) {
        continue;
      }

      violations.push({
        code: "DOCQ003",
        filePath,
        message: `In-scope markdown filename contains forbidden token '${token}'.`
      });
    }

    violations.push(...(await validateRelativeLinks({ filePath, content })));
  }

  return {
    status: violations.length === 0 ? "pass" : "fail",
    scannedFileCount: markdownFiles.length,
    inScopeFileCount: inScopeCount,
    excludedHistoryCount: HISTORY_EXCLUDE.size,
    violations
  };
}

export async function main({ logger = console } = {}) {
  try {
    const result = await evaluateDocQuality();

    if (result.status === "pass") {
      logger.info(
        `Doc quality passed for ${result.scannedFileCount} markdown files (${result.inScopeFileCount} in scope, ${result.excludedHistoryCount} excluded history) (DOCQ000).`
      );
      return;
    }

    logger.error(`Doc quality violations detected (${result.violations.length}) (DOCQ001):`);
    for (const [index, violation] of result.violations.entries()) {
      logger.error(`${index + 1}) [${violation.code}] ${violation.filePath}`);
      if (violation.line) {
        logger.error(`   line ${violation.line}`);
      }
      logger.error(`   ${violation.message}`);
    }

    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exitCode = 1;
  }
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void main();
}
