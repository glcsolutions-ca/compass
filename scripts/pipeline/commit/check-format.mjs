import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createCcsError, withCcsGuardrail } from "../shared/ccs-contract.mjs";

const execFileAsync = promisify(execFile);
const PRETTIER_FORMAT_FAILURE_CODE = 1;

function normalizeOutput(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function collectPrettierOutput({ stdout = "", stderr = "" } = {}) {
  return [normalizeOutput(stdout), normalizeOutput(stderr)]
    .filter((chunk) => chunk.length > 0)
    .join("\n");
}

export function buildFmt001Lines() {
  return [
    "FMT001 formatting violations detected",
    "- One or more files are not Prettier-compliant.",
    "Fix:",
    "  pnpm exec lint-staged",
    "  # or full repo:",
    "  pnpm format",
    "Then:",
    "  pnpm test:quick"
  ];
}

export function isFormattingViolationError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && Number(error.code) === PRETTIER_FORMAT_FAILURE_CODE) {
    return true;
  }

  return false;
}

export async function runFormatCheck({ execFileFn = execFileAsync, logger = console } = {}) {
  try {
    const { stdout, stderr } = await execFileFn("pnpm", ["exec", "prettier", "--check", "."], {
      encoding: "utf8"
    });
    const prettierOutput = collectPrettierOutput({ stdout, stderr });
    if (prettierOutput.length > 0) {
      logger.info(prettierOutput);
    }

    logger.info("Format check passed (FMT000).");
    return { status: "pass", reasonCode: "FMT000" };
  } catch (error) {
    if (!isFormattingViolationError(error)) {
      throw error;
    }

    const prettierOutput = collectPrettierOutput({
      stdout: error.stdout,
      stderr: error.stderr
    });

    for (const line of buildFmt001Lines()) {
      logger.error(line);
    }

    if (prettierOutput.length > 0) {
      logger.error("Details:");
      logger.error(prettierOutput);
    }

    return { status: "fail", reasonCode: "FMT001", output: prettierOutput };
  }
}

export async function main({ logger = console } = {}) {
  await withCcsGuardrail({
    guardrailId: "format.check",
    command: "pnpm format:check",
    passCode: "FMT000",
    passRef: "docs/ccs.md#output-format",
    logger,
    run: async () => {
      const result = await runFormatCheck({ logger });
      if (result.status === "fail") {
        throw createCcsError({
          code: "FMT001",
          why: "Formatting violations detected.",
          fix: "Ensure all tracked files are Prettier-compliant.",
          doCommands: ["pnpm exec lint-staged", "pnpm format", "pnpm test:quick"],
          ref: "docs/agents/workflow-playbook.md#standard-agent-loop"
        });
      }

      return { status: "pass", code: "FMT000" };
    },
    mapError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      return {
        code: "CCS_UNEXPECTED_ERROR",
        why: message,
        fix: "Run format check with a valid local workspace and retry.",
        doCommands: ["pnpm format:check"],
        ref: "docs/ccs.md#output-format"
      };
    }
  });
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  void main();
}
