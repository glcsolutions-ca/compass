import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DEFAULT_DATABASE_URL, resolveDatabaseUrl } from "./constants.mjs";

async function withTempDir(run) {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "db-constants-"));
  try {
    return await run(baseDir);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
}

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL from process env", async () => {
    await withTempDir(async (tempDir) => {
      const postgresEnvPath = path.join(tempDir, ".env");
      await writeFile(postgresEnvPath, "DATABASE_URL=postgres://file:file@localhost:6000/file\n");

      const resolved = resolveDatabaseUrl({
        env: { DATABASE_URL: "postgres://env:env@localhost:7777/env" },
        postgresEnvPath
      });

      expect(resolved).toBe("postgres://env:env@localhost:7777/env");
    });
  });

  it("falls back to DATABASE_URL from db/postgres/.env when process env is unset", async () => {
    await withTempDir(async (tempDir) => {
      const postgresEnvPath = path.join(tempDir, ".env");
      await writeFile(
        postgresEnvPath,
        "DATABASE_URL=postgres://file:file@localhost:6000/from-file\n",
        "utf8"
      );

      const resolved = resolveDatabaseUrl({
        env: {},
        postgresEnvPath
      });

      expect(resolved).toBe("postgres://file:file@localhost:6000/from-file");
    });
  });

  it("builds DATABASE_URL from POSTGRES_PORT when DATABASE_URL is not present in db/postgres/.env", async () => {
    await withTempDir(async (tempDir) => {
      const postgresEnvPath = path.join(tempDir, ".env");
      await writeFile(postgresEnvPath, "POSTGRES_PORT=5544\n", "utf8");

      const resolved = resolveDatabaseUrl({
        env: {},
        postgresEnvPath
      });

      expect(resolved).toBe("postgres://compass:compass@localhost:5544/compass");
    });
  });

  it("uses the hardcoded fallback when no env value is available", () => {
    const resolved = resolveDatabaseUrl({
      env: {},
      postgresEnvPath: path.resolve("does-not-exist/.env")
    });

    expect(resolved).toBe(DEFAULT_DATABASE_URL);
  });
});
