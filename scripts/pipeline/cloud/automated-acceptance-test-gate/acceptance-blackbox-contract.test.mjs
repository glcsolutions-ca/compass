import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ACCEPTANCE_TEST_FILES = [
  "tests/system/smoke.ts",
  "tests/system/codex-smoke.ts",
  "tests/e2e/smoke.spec.ts"
];

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8");
}

function hasRuntimeAppImport(content) {
  const importPattern = /\bfrom\s+["'][^"']*apps\/[^"']*["']/g;
  const requirePattern = /\brequire\(\s*["'][^"']*apps\/[^"']*["']\s*\)/g;
  return importPattern.test(content) || requirePattern.test(content);
}

describe("acceptance black-box contract", () => {
  for (const filePath of ACCEPTANCE_TEST_FILES) {
    it(`keeps ${filePath} free of apps/** runtime imports`, () => {
      const content = readUtf8(filePath);
      expect(hasRuntimeAppImport(content)).toBe(false);
    });
  }
});
