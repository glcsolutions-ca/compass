import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const COMMIT_STAGE_FILE_PATH = "apps/api/src/app.test.ts";
const ESLINT_POLICY_TEST_TIMEOUT_MS = 15_000;

async function lintMessages(code) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath: COMMIT_STAGE_FILE_PATH });
  return result.messages.map((message) => message.message);
}

describe("policy-driven eslint test hygiene", () => {
  it(
    "flags Math.random usage in commit-stage tests",
    { timeout: ESLINT_POLICY_TEST_TIMEOUT_MS },
    async () => {
      const messages = await lintMessages(
        "const value = Math.random();\nexpect(value).toBeDefined();"
      );
      expect(
        messages.some((message) =>
          message.includes("Commit-stage tests must be deterministic. Avoid Math.random()")
        )
      ).toBe(true);
    }
  );

  it(
    "flags raw setTimeout usage in commit-stage tests",
    { timeout: ESLINT_POLICY_TEST_TIMEOUT_MS },
    async () => {
      const messages = await lintMessages("setTimeout(() => {}, 10);");
      expect(
        messages.some((message) => message.includes("Raw setTimeout in commit-stage tests"))
      ).toBe(true);
    }
  );

  it(
    "flags direct pg imports in commit-stage tests",
    { timeout: ESLINT_POLICY_TEST_TIMEOUT_MS },
    async () => {
      const messages = await lintMessages("import { Client } from 'pg';\nvoid Client;");
      expect(
        messages.some((message) =>
          message.includes("Commit-stage tests must not import pg directly")
        )
      ).toBe(true);
    }
  );

  it(
    "flags focused tests in commit-stage tests",
    { timeout: ESLINT_POLICY_TEST_TIMEOUT_MS },
    async () => {
      const messages = await lintMessages("test.only('focused', () => {});");
      expect(
        messages.some((message) => message.includes("Focused tests (test.only) are forbidden"))
      ).toBe(true);
    }
  );
});
