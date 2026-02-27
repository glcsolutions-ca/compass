import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createCcsError, withCcsGuardrail } from "../shared/ccs-contract.mjs";

const execFileAsync = promisify(execFile);

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function normalizeTermKey(term) {
  return String(term || "")
    .replace(/[`"'"]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/[^\w\s*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildDefinitionLookup(canonicalDefinitions) {
  const lookup = new Map();
  for (const [rawKey, rawDefinition] of Object.entries(canonicalDefinitions || {})) {
    const key = normalizeTermKey(rawKey);
    const definition = String(rawDefinition || "").trim();
    if (key.length === 0 || definition.length === 0) {
      continue;
    }
    lookup.set(key, definition);
  }
  return lookup;
}

function inferCanonicalTerm(rule) {
  const explicit = String(rule.canonical || "").trim();
  if (explicit.length > 0) {
    return explicit;
  }

  const message = String(rule.message || "").trim();
  const match = message.match(/\buse\s+(.+?)(?:\.)?$/i);
  if (!match) {
    return "";
  }

  return String(match[1] || "").trim();
}

function lineTextAt(content, lineNumber) {
  if (lineNumber <= 0) {
    return "";
  }
  const line = content.split("\n")[lineNumber - 1] ?? "";
  return line.trim();
}

function matchesAnyPattern(filePath, patterns) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  return patterns.some((pattern) => path.posix.matchesGlob(normalizedPath, pattern));
}

function withoutAllowlistedSubstrings(content, allowlistSubstrings) {
  let result = content;
  for (const substring of allowlistSubstrings) {
    if (!substring) {
      continue;
    }
    result = result.split(substring).join("");
  }
  return result;
}

async function trackedFiles() {
  const { stdout } = await execFileAsync("git", ["ls-files"], { encoding: "utf8" });
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function main() {
  const policyPath =
    process.env.TERMINOLOGY_POLICY_PATH ??
    path.join(".github", "policy", "terminology-policy.json");

  const policy = await readJson(policyPath);
  const include = policy.scan?.include ?? [];
  const exclude = policy.scan?.exclude ?? [];
  const allowlistSubstrings = policy.allowlistSubstrings ?? [];
  const canonicalDefinitions = policy.canonicalDefinitions ?? {};
  const forbiddenPatterns = policy.forbiddenPatterns ?? [];

  if (!Array.isArray(include) || include.length === 0) {
    throw new Error("terminology policy scan.include must be a non-empty array");
  }

  if (!Array.isArray(forbiddenPatterns) || forbiddenPatterns.length === 0) {
    throw new Error("terminology policy forbiddenPatterns must be a non-empty array");
  }

  if (
    canonicalDefinitions !== undefined &&
    (!canonicalDefinitions ||
      typeof canonicalDefinitions !== "object" ||
      Array.isArray(canonicalDefinitions))
  ) {
    throw new Error("terminology policy canonicalDefinitions must be an object when provided");
  }

  const definitionLookup = buildDefinitionLookup(canonicalDefinitions);
  const files = await trackedFiles();
  const scanFiles = files.filter(
    (filePath) => matchesAnyPattern(filePath, include) && !matchesAnyPattern(filePath, exclude)
  );

  const violations = [];

  for (const filePath of scanFiles) {
    let contentRaw;
    try {
      contentRaw = await readFile(filePath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        // Deletions may still appear in git ls-files until index update.
        continue;
      }
      throw error;
    }
    const content = withoutAllowlistedSubstrings(contentRaw, allowlistSubstrings);

    for (const rule of forbiddenPatterns) {
      const pattern = String(rule.pattern || "");
      const flags = String(rule.flags || "g");
      const message = String(rule.message || "Legacy terminology is forbidden.");

      if (!pattern) {
        continue;
      }

      const regex = new RegExp(pattern, flags);
      const match = regex.exec(content);
      if (!match) {
        continue;
      }

      const canonicalTerm = inferCanonicalTerm(rule);
      const normalizedCanonicalTerm = normalizeTermKey(canonicalTerm);
      const definition =
        String(rule.definition || "").trim() ||
        (normalizedCanonicalTerm.length > 0 ? definitionLookup.get(normalizedCanonicalTerm) : "") ||
        "";
      const prior = content.slice(0, match.index);
      const line = prior.split("\n").length;
      const context = lineTextAt(contentRaw, line);

      violations.push({
        filePath,
        line,
        match: match[0],
        message,
        canonicalTerm,
        definition,
        context
      });
    }
  }

  if (violations.length > 0) {
    console.error(`Farley terminology policy violations detected (${violations.length}):`);

    for (const [index, violation] of violations.entries()) {
      console.error("");
      console.error(`${index + 1}) ${violation.filePath}:${violation.line}`);
      console.error(`   Found legacy term: '${violation.match}'`);
      if (violation.canonicalTerm) {
        console.error(`   Correct term: '${violation.canonicalTerm}'`);
      }
      if (violation.definition) {
        console.error(`   Definition: ${violation.definition}`);
      }
      console.error(`   Policy guidance: ${violation.message}`);
      if (violation.context) {
        console.error(`   Context: ${violation.context}`);
      }
    }
    console.error("");
    console.error("Fix terminology violations and rerun: pnpm ci:terminology-policy");
    throw createCcsError({
      code: "TERM001",
      why: `Terminology policy violations detected (${violations.length}).`,
      fix: "Replace legacy terms with canonical terminology.",
      doCommands: ["pnpm ci:terminology-policy", "pnpm test:quick"],
      ref: "docs/ccs.md#output-format"
    });
  }

  console.info(`Farley terminology policy passed for ${scanFiles.length} files.`);
  return { status: "pass", code: "TERM000" };
}

void withCcsGuardrail({
  guardrailId: "terminology.policy",
  command: "pnpm ci:terminology-policy",
  passCode: "TERM000",
  passRef: "docs/ccs.md#output-format",
  run: main,
  mapError: (error) => ({
    code: "CCS_UNEXPECTED_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve terminology policy runtime errors and rerun the guardrail.",
    doCommands: ["pnpm ci:terminology-policy"],
    ref: "docs/ccs.md#output-format"
  })
});
