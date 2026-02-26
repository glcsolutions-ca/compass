import { describe, expect, it } from "vitest";
import { buildFmt001Lines, collectPrettierOutput, runFormatCheck } from "./check-format.mjs";

function createLogger() {
  const infoMessages = [];
  const errorMessages = [];

  return {
    logger: {
      info: (message) => infoMessages.push(String(message)),
      error: (message) => errorMessages.push(String(message))
    },
    infoMessages,
    errorMessages
  };
}

function createExecError({ code, stdout = "", stderr = "", message = "command failed" }) {
  const error = new Error(message);
  error.code = code;
  error.stdout = stdout;
  error.stderr = stderr;
  return error;
}

describe("collectPrettierOutput", () => {
  it("combines stdout and stderr while preserving order", () => {
    const output = collectPrettierOutput({
      stdout: "Checking formatting...\n[warn] docs/README.md",
      stderr: "stderr details"
    });

    expect(output).toContain("Checking formatting...");
    expect(output).toContain("[warn] docs/README.md");
    expect(output).toContain("stderr details");
  });
});

describe("runFormatCheck", () => {
  it("passes when prettier check succeeds", async () => {
    const { logger, infoMessages, errorMessages } = createLogger();

    const result = await runFormatCheck({
      execFileFn: async () => ({
        stdout: "Checking formatting...\nAll matched files use Prettier code style!\n",
        stderr: ""
      }),
      logger
    });

    expect(result).toEqual({ status: "pass", reasonCode: "FMT000" });
    expect(infoMessages.join("\n")).toContain("Format check passed (FMT000).");
    expect(errorMessages).toEqual([]);
  });

  it("emits FMT001 and fix guidance on formatting violations", async () => {
    const { logger, errorMessages } = createLogger();

    const result = await runFormatCheck({
      execFileFn: async () => {
        throw createExecError({
          code: 1,
          stdout: "Checking formatting...\n[warn] docs/runbooks/test-quick-farley-assessment.md"
        });
      },
      logger
    });

    expect(result).toMatchObject({ status: "fail", reasonCode: "FMT001" });
    const rendered = errorMessages.join("\n");
    for (const line of buildFmt001Lines()) {
      expect(rendered).toContain(line);
    }
    expect(rendered).toContain("[warn] docs/runbooks/test-quick-farley-assessment.md");
  });

  it("preserves prettier stderr details in failure output", async () => {
    const { logger, errorMessages } = createLogger();

    await runFormatCheck({
      execFileFn: async () => {
        throw createExecError({
          code: "1",
          stdout: "Checking formatting...",
          stderr: "stderr details"
        });
      },
      logger
    });

    expect(errorMessages.join("\n")).toContain("stderr details");
  });

  it("throws on unexpected execution errors", async () => {
    await expect(
      runFormatCheck({
        execFileFn: async () => {
          throw createExecError({
            code: 2,
            message: "spawn ENOENT"
          });
        }
      })
    ).rejects.toThrow("spawn ENOENT");
  });
});
