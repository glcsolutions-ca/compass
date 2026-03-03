import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fileExists,
  getChangedFiles,
  matchesAnyPattern,
  parseJsonEnv,
  parsePossiblyFencedJson,
  readJsonFile,
  requireEnv,
  writeJsonFile
} from "./pipeline-utils.mjs";

describe("environment helpers", () => {
  const touchedEnv = [];

  afterEach(() => {
    for (const key of touchedEnv) {
      delete process.env[key];
    }
    touchedEnv.length = 0;
  });

  it("requireEnv returns trimmed values", () => {
    process.env.PIPELINE_UTILS_TEST_REQUIRED = "  value  ";
    touchedEnv.push("PIPELINE_UTILS_TEST_REQUIRED");

    expect(requireEnv("PIPELINE_UTILS_TEST_REQUIRED")).toBe("value");
  });

  it("parseJsonEnv parses JSON payloads", () => {
    process.env.PIPELINE_UTILS_TEST_JSON = '{"enabled":true,"count":2}';
    touchedEnv.push("PIPELINE_UTILS_TEST_JSON");

    expect(parseJsonEnv("PIPELINE_UTILS_TEST_JSON")).toEqual({ enabled: true, count: 2 });
    expect(parseJsonEnv("PIPELINE_UTILS_TEST_MISSING", { fallback: true })).toEqual({
      fallback: true
    });
  });

  it("parsePossiblyFencedJson accepts fenced JSON blocks", () => {
    const raw = '```json\n{\n  "ok": true\n}\n```';
    expect(parsePossiblyFencedJson(raw)).toEqual({ ok: true });
  });
});

describe("filesystem helpers", () => {
  it("writes and reads JSON files", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pipeline-utils-json-"));
    const filePath = path.join(tempDir, "artifact", "result.json");

    try {
      await writeJsonFile(filePath, { pass: true, reasonCodes: [] });
      await expect(fileExists(filePath)).resolves.toBe(true);
      await expect(readJsonFile(filePath)).resolves.toEqual({ pass: true, reasonCodes: [] });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("glob matching", () => {
  it("matches dot-prefixed workflow paths", () => {
    expect(matchesAnyPattern(".github/workflows/commit-stage.yml", [".github/workflows/**"])).toBe(
      true
    );
  });

  it("keeps deterministic behavior for '**' patterns", () => {
    expect(matchesAnyPattern(".github/workflows/commit-stage.yml", ["**"])).toBe(false);
    expect(matchesAnyPattern("README.md", ["**"])).toBe(true);
  });
});

describe("getChangedFiles", () => {
  function runGit(repoDir, args, options = {}) {
    const gitEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"))
    );

    return execFileSync("git", args, {
      cwd: repoDir,
      env: gitEnv,
      ...options
    });
  }

  function initRepo() {
    const repoDir = mkdtempSync(path.join(os.tmpdir(), "pipeline-scope-"));
    runGit(repoDir, ["init"]);
    runGit(repoDir, ["config", "user.name", "Compass Test"]);
    runGit(repoDir, ["config", "user.email", "compass-test@example.com"]);
    return repoDir;
  }

  it("returns changed files using symmetric diff when base exists", async () => {
    const repoDir = initRepo();
    const previousCwd = process.cwd();

    try {
      writeFileSync(path.join(repoDir, "a.txt"), "one\n", "utf8");
      runGit(repoDir, ["add", "a.txt"]);
      runGit(repoDir, ["commit", "-m", "first"]);

      writeFileSync(path.join(repoDir, "b.txt"), "two\n", "utf8");
      runGit(repoDir, ["add", "b.txt"]);
      runGit(repoDir, ["commit", "-m", "second"]);

      const baseSha = runGit(repoDir, ["rev-parse", "HEAD^"], {
        encoding: "utf8"
      }).trim();
      const headSha = runGit(repoDir, ["rev-parse", "HEAD"], {
        encoding: "utf8"
      }).trim();

      process.chdir(repoDir);
      await expect(getChangedFiles(baseSha, headSha)).resolves.toEqual(["b.txt"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("falls back to head commit files when symmetric diff base is missing", async () => {
    const repoDir = initRepo();
    const previousCwd = process.cwd();

    try {
      writeFileSync(path.join(repoDir, "a.txt"), "one\n", "utf8");
      runGit(repoDir, ["add", "a.txt"]);
      runGit(repoDir, ["commit", "-m", "first"]);

      writeFileSync(path.join(repoDir, "b.txt"), "two\n", "utf8");
      runGit(repoDir, ["add", "b.txt"]);
      runGit(repoDir, ["commit", "-m", "second"]);

      const headSha = runGit(repoDir, ["rev-parse", "HEAD"], {
        encoding: "utf8"
      }).trim();

      process.chdir(repoDir);
      await expect(
        getChangedFiles("0000000000000000000000000000000000000000", headSha)
      ).resolves.toEqual(["b.txt"]);
    } finally {
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("ignores inherited git context environment variables", async () => {
    const repoDir = initRepo();
    const previousCwd = process.cwd();

    try {
      writeFileSync(path.join(repoDir, "a.txt"), "one\n", "utf8");
      runGit(repoDir, ["add", "a.txt"]);
      runGit(repoDir, ["commit", "-m", "first"]);

      writeFileSync(path.join(repoDir, "b.txt"), "two\n", "utf8");
      runGit(repoDir, ["add", "b.txt"]);
      runGit(repoDir, ["commit", "-m", "second"]);

      const baseSha = runGit(repoDir, ["rev-parse", "HEAD^"], {
        encoding: "utf8"
      }).trim();
      const headSha = runGit(repoDir, ["rev-parse", "HEAD"], {
        encoding: "utf8"
      }).trim();

      process.env.GIT_DIR = "/invalid";
      process.env.GIT_WORK_TREE = "/invalid";

      process.chdir(repoDir);
      await expect(getChangedFiles(baseSha, headSha)).resolves.toEqual(["b.txt"]);
    } finally {
      delete process.env.GIT_DIR;
      delete process.env.GIT_WORK_TREE;
      process.chdir(previousCwd);
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
