import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  PreflightError,
  resolveDatabaseUrlForFullTest,
  runTestFullPreflight
} from "./test-full-preflight.mjs";

const cleanupDirs = [];

async function createTempRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "test-full-preflight-"));
  cleanupDirs.push(repoDir);
  return repoDir;
}

async function writePostgresEnv(repoDir, content) {
  const envDir = path.join(repoDir, "db", "postgres");
  await mkdir(envDir, { recursive: true });
  await writeFile(path.join(envDir, ".env"), content, "utf8");
}

afterEach(async () => {
  while (cleanupDirs.length > 0) {
    const repoDir = cleanupDirs.pop();
    if (repoDir) {
      await rm(repoDir, { recursive: true, force: true });
    }
  }
});

describe("resolveDatabaseUrlForFullTest", () => {
  it("prefers DATABASE_URL from env", async () => {
    const repoDir = await createTempRepo();

    const resolved = await resolveDatabaseUrlForFullTest({
      rootDir: repoDir,
      env: { DATABASE_URL: "postgres://env:env@localhost:5432/envdb" }
    });

    expect(resolved).toEqual({
      databaseUrl: "postgres://env:env@localhost:5432/envdb",
      source: "DATABASE_URL"
    });
  });

  it("builds local URL from POSTGRES_PORT when DATABASE_URL is absent in db/postgres/.env", async () => {
    const repoDir = await createTempRepo();
    await writePostgresEnv(repoDir, "POSTGRES_PORT=55432\n");

    const resolved = await resolveDatabaseUrlForFullTest({ rootDir: repoDir, env: {} });
    expect(resolved).toEqual({
      databaseUrl: "postgres://compass:compass@localhost:55432/compass",
      source: "db/postgres/.env POSTGRES_PORT"
    });
  });

  it("throws FULL001 when backend env is not found", async () => {
    const repoDir = await createTempRepo();

    await expect(
      resolveDatabaseUrlForFullTest({
        rootDir: repoDir,
        env: {}
      })
    ).rejects.toMatchObject({
      name: "PreflightError",
      code: "FULL001"
    });
  });
});

describe("runTestFullPreflight", () => {
  it("throws FULL001 when Postgres is unreachable", async () => {
    const repoDir = await createTempRepo();
    await writePostgresEnv(repoDir, "POSTGRES_PORT=55432\n");

    await expect(
      runTestFullPreflight({
        rootDir: repoDir,
        env: {},
        connectFn: async () => false
      })
    ).rejects.toMatchObject({
      name: "PreflightError",
      code: "FULL001"
    });
  });

  it("passes when connection succeeds", async () => {
    const repoDir = await createTempRepo();
    await writePostgresEnv(
      repoDir,
      "DATABASE_URL=postgres://compass:compass@localhost:55432/compass\n"
    );

    await expect(
      runTestFullPreflight({
        rootDir: repoDir,
        env: {},
        connectFn: async () => true,
        logger: { info: () => {}, error: () => {} }
      })
    ).resolves.toBeUndefined();
  });

  it("throws FULL001 on invalid DATABASE_URL syntax", async () => {
    const repoDir = await createTempRepo();

    await expect(
      runTestFullPreflight({
        rootDir: repoDir,
        env: { DATABASE_URL: "not-a-url" },
        connectFn: async () => true
      })
    ).rejects.toBeInstanceOf(PreflightError);
  });
});
