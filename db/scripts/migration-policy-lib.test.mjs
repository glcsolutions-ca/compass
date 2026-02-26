import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  calculateMigrationChecksums,
  validateMigrationDirectory,
  validateMigrationPolicy,
  writeChecksumsManifest
} from "./migration-policy-lib.mjs";

async function withTempDir(run) {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "migration-policy-lib-"));
  try {
    return await run(baseDir);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
}

async function writeMigration(dir, fileName, content = "export async function up() {}\n") {
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("migration-policy-lib", () => {
  it("accepts legacy hyphenated migration names for compatibility", async () => {
    await withTempDir(async (migrationsDir) => {
      await writeMigration(migrationsDir, "1771913577531_auth-foundation.mjs");

      const result = await validateMigrationDirectory({ migrationsDir });
      expect(result.failures).toEqual([]);
      expect(result.migrationFiles).toEqual(["1771913577531_auth-foundation.mjs"]);
    });
  });

  it("passes policy validation for a valid migration set", async () => {
    await withTempDir(async (migrationsDir) => {
      const checksumsPath = path.join(migrationsDir, "checksums.json");
      await writeMigration(migrationsDir, "1772075557000_baseline_platform_schema.mjs");

      await writeChecksumsManifest({ migrationsDir, checksumsPath });

      const result = await validateMigrationPolicy({ migrationsDir, checksumsPath });
      expect(result.ok).toBe(true);
      expect(result.failures).toEqual([]);
      expect(result.migrationFiles).toEqual(["1772075557000_baseline_platform_schema.mjs"]);
    });
  });

  it("fails directory validation when non-.mjs migration files are present", async () => {
    await withTempDir(async (migrationsDir) => {
      await writeMigration(migrationsDir, "1772075557000_baseline_platform_schema.mjs");
      await writeMigration(migrationsDir, "1772075558000_bad.sql", "select 1;\n");

      const result = await validateMigrationDirectory({ migrationsDir });
      expect(result.failures).toContain(
        "Non-.mjs file found in db/migrations: 1772075558000_bad.sql"
      );
    });
  });

  it("fails policy validation when checksums drift", async () => {
    await withTempDir(async (migrationsDir) => {
      const checksumsPath = path.join(migrationsDir, "checksums.json");
      const fileName = "1772075557000_baseline_platform_schema.mjs";
      await writeMigration(migrationsDir, fileName);

      await writeFile(
        checksumsPath,
        JSON.stringify(
          {
            schemaVersion: "1",
            algorithm: "sha256",
            files: {
              [fileName]: "0000000000000000000000000000000000000000000000000000000000000000"
            }
          },
          null,
          2
        ),
        "utf8"
      );

      const result = await validateMigrationPolicy({ migrationsDir, checksumsPath });
      expect(result.ok).toBe(false);
      expect(result.failures.some((failure) => failure.includes("Checksum drift"))).toBe(true);
    });
  });

  it("writes checksums manifest with sorted migration keys", async () => {
    await withTempDir(async (migrationsDir) => {
      const checksumsPath = path.join(migrationsDir, "checksums.json");
      await writeMigration(migrationsDir, "1772075559000_second.mjs");
      await writeMigration(migrationsDir, "1772075558000_first.mjs");

      const checksums = await calculateMigrationChecksums({ migrationsDir });
      await writeChecksumsManifest({ migrationsDir, checksumsPath });

      const manifest = JSON.parse(await readFile(checksumsPath, "utf8"));
      expect(Object.keys(manifest.files)).toEqual([
        "1772075558000_first.mjs",
        "1772075559000_second.mjs"
      ]);
      expect(manifest.files["1772075558000_first.mjs"]).toBe(checksums["1772075558000_first.mjs"]);
      expect(manifest.files["1772075559000_second.mjs"]).toBe(
        checksums["1772075559000_second.mjs"]
      );
    });
  });
});
