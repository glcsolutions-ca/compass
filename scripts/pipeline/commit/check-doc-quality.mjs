import { pathToFileURL } from "node:url";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DOCS_ROOT = "docs";
const CANONICAL_DOC_PATH = path.join("docs", "development-pipeline.md");
const MAX_DOC_LINES_EXCLUSIVE = 300;
const FORBIDDEN_CANONICAL_TOKENS = ["one-pager", "playbook"];
const AUDIENCE_PREFIX_PATTERN = /^(agent|agents|human|humans|developer|developers|user|users)-/;

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
      files.push(...(await listMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath.replaceAll("\\", "/"));
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

function isCanonicalDoc(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  if (!normalized.startsWith("docs/")) {
    return false;
  }

  const relativePath = normalized.slice("docs/".length);
  return !relativePath.includes("/") && relativePath !== "README.md";
}

export async function evaluateDocQuality({
  docsRoot = DOCS_ROOT,
  canonicalDocPath = CANONICAL_DOC_PATH,
  maxLinesExclusive = MAX_DOC_LINES_EXCLUSIVE
} = {}) {
  const violations = [];

  if (!(await pathExists(canonicalDocPath))) {
    violations.push({
      code: "DOCQ001",
      filePath: canonicalDocPath,
      message: `Canonical pipeline doc is required at ${canonicalDocPath}.`
    });
  }

  const markdownFiles = await listMarkdownFiles(docsRoot);

  for (const filePath of markdownFiles) {
    const content = await readFile(filePath, "utf8");
    const lineCount = countLines(content);

    if (lineCount >= maxLinesExclusive) {
      violations.push({
        code: "DOCQ002",
        filePath,
        message: `Markdown files under docs must stay below ${maxLinesExclusive} lines (found ${lineCount}).`
      });
    }

    if (!isCanonicalDoc(filePath)) {
      continue;
    }

    const fileName = path.basename(filePath).toLowerCase();

    for (const token of FORBIDDEN_CANONICAL_TOKENS) {
      if (!fileName.includes(token)) {
        continue;
      }

      violations.push({
        code: "DOCQ003",
        filePath,
        message: `Canonical doc filenames cannot contain '${token}'.`
      });
    }

    if (AUDIENCE_PREFIX_PATTERN.test(fileName)) {
      violations.push({
        code: "DOCQ004",
        filePath,
        message: "Canonical doc filenames cannot use audience prefixes."
      });
    }
  }

  return {
    status: violations.length === 0 ? "pass" : "fail",
    scannedFileCount: markdownFiles.length,
    violations
  };
}

export async function main({ logger = console } = {}) {
  try {
    const result = await evaluateDocQuality();

    if (result.status === "pass") {
      logger.info(`Doc quality passed for ${result.scannedFileCount} docs files (DOCQ000).`);
      return;
    }

    logger.error(`Doc quality violations detected (${result.violations.length}) (DOCQ001):`);
    for (const [index, violation] of result.violations.entries()) {
      logger.error(`${index + 1}) [${violation.code}] ${violation.filePath}`);
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
