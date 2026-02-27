import { describe, expect, it } from "vitest";
import {
  CcsError,
  createCcsError,
  emitFail,
  emitPass,
  toCcsFailure,
  withCcsGuardrail
} from "./ccs-contract.mjs";

function createLogger() {
  const info = [];
  const error = [];
  return {
    logger: {
      info: (line) => info.push(String(line)),
      error: (line) => error.push(String(line))
    },
    info,
    error
  };
}

describe("ccs-contract", () => {
  it("emits canonical CCS pass line", () => {
    const { logger, info } = createLogger();
    emitPass({ guardrailId: "format.check", code: "FMT000", logger });
    expect(info).toEqual(["CCS:PASS format.check CODE:FMT000"]);
  });

  it("emits canonical CCS fail envelope", () => {
    const { logger, error } = createLogger();
    emitFail({
      guardrailId: "format.check",
      code: "FMT001",
      why: "Formatting violations detected.",
      fix: "Apply Prettier formatting.",
      doCommands: ["pnpm exec lint-staged", "pnpm test:quick"],
      ref: "docs/ccs.md#output-format",
      logger
    });

    expect(error).toEqual([
      "CCS:FAIL format.check CODE:FMT001",
      "WHY: Formatting violations detected.",
      "FIX: Apply Prettier formatting.",
      "DO:",
      "pnpm exec lint-staged",
      "pnpm test:quick",
      "REF: docs/ccs.md#output-format"
    ]);
  });

  it("maps unexpected errors to CCS failure payload", () => {
    const failure = toCcsFailure({
      guardrailId: "docs.drift",
      error: new Error("bad json"),
      command: "pnpm ci:docs-drift"
    });
    expect(failure.code).toBe("CCS_UNEXPECTED_ERROR");
    expect(failure.why).toContain("bad json");
    expect(failure.doCommands).toContain("pnpm ci:docs-drift");
  });

  it("supports typed CCS errors", () => {
    const failure = toCcsFailure({
      guardrailId: "docs.drift",
      error: createCcsError({
        code: "DOCS001",
        why: "Docs drift blocking.",
        fix: "Update docs target.",
        doCommands: ["pnpm ci:docs-drift"],
        ref: "docs/commit-stage-policy.md#docs-drift"
      })
    });

    expect(failure).toEqual({
      code: "DOCS001",
      why: "Docs drift blocking.",
      fix: "Update docs target.",
      doCommands: ["pnpm ci:docs-drift"],
      ref: "docs/commit-stage-policy.md#docs-drift"
    });
  });

  it("wraps runnable guardrail and emits pass", async () => {
    const { logger, info, error } = createLogger();
    let exitCode = 0;
    await withCcsGuardrail({
      guardrailId: "scope.resolve",
      passCode: "SCOPE000",
      run: async () => ({ status: "pass", code: "SCOPE000" }),
      logger,
      setExitCode: (code) => {
        exitCode = code;
      }
    });

    expect(info).toEqual(["CCS:PASS scope.resolve CODE:SCOPE000"]);
    expect(error).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it("wraps runnable guardrail and emits fail on thrown error", async () => {
    const { logger, error } = createLogger();
    let exitCode = 0;
    await withCcsGuardrail({
      guardrailId: "scope.resolve",
      command: "pnpm ci:scope",
      run: async () => {
        throw new CcsError({
          code: "SCOPE001",
          why: "Unable to resolve changed files.",
          fix: "Provide valid SHAs.",
          doCommands: ["pnpm ci:scope"],
          ref: "docs/commit-stage-policy.md#trigger-contract"
        });
      },
      logger,
      setExitCode: (code) => {
        exitCode = code;
      }
    });

    expect(error[0]).toBe("CCS:FAIL scope.resolve CODE:SCOPE001");
    expect(error).toContain("WHY: Unable to resolve changed files.");
    expect(error).toContain("FIX: Provide valid SHAs.");
    expect(error).toContain("DO:");
    expect(error).toContain("pnpm ci:scope");
    expect(error).toContain("REF: docs/commit-stage-policy.md#trigger-contract");
    expect(exitCode).toBe(1);
  });

  it("preserves typed CCS errors when mapError is provided", async () => {
    const { logger, error } = createLogger();
    let exitCode = 0;
    await withCcsGuardrail({
      guardrailId: "format.check",
      command: "pnpm format:check",
      run: async () => {
        throw createCcsError({
          code: "FMT001",
          why: "Formatting violations detected.",
          fix: "Ensure files are Prettier-compliant.",
          doCommands: ["pnpm exec lint-staged", "pnpm test:quick"],
          ref: "docs/agents/workflow-playbook.md#standard-agent-loop"
        });
      },
      mapError: () => ({
        code: "CCS_UNEXPECTED_ERROR",
        why: "fallback",
        fix: "fallback",
        doCommands: ["pnpm format:check"],
        ref: "docs/ccs.md#output-format"
      }),
      logger,
      setExitCode: (code) => {
        exitCode = code;
      }
    });

    expect(error[0]).toBe("CCS:FAIL format.check CODE:FMT001");
    expect(error).toContain("WHY: Formatting violations detected.");
    expect(error).toContain("FIX: Ensure files are Prettier-compliant.");
    expect(error).toContain("pnpm exec lint-staged");
    expect(error).toContain("REF: docs/agents/workflow-playbook.md#standard-agent-loop");
    expect(exitCode).toBe(1);
  });
});
