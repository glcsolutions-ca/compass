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
  it("accepts only 13-digit migration names with underscore separators", async () => {
    await withTempDir(async (migrationsDir) => {
      await writeMigration(migrationsDir, "1772083000000_initial_schema.mjs");
      await writeMigration(migrationsDir, "1772083000001_add_indexes.mjs");

      const result = await validateMigrationDirectory({ migrationsDir });
      expect(result.failures).toEqual([]);
      expect(result.migrationFiles).toEqual([
        "1772083000000_initial_schema.mjs",
        "1772083000001_add_indexes.mjs"
      ]);
    });
  });

  it("rejects 14-digit migration names", async () => {
    await withTempDir(async (migrationsDir) => {
      await writeMigration(migrationsDir, "20260226050000_baseline_platform_schema.mjs");

      const result = await validateMigrationDirectory({ migrationsDir });
      expect(result.failures).toContain(
        "Invalid migration filename '20260226050000_baseline_platform_schema.mjs'. Expected pattern: ^\\d{13}_[a-z0-9_]+\\.mjs$"
      );
    });
  });

  it("rejects hyphenated migration names", async () => {
    await withTempDir(async (migrationsDir) => {
      await writeMigration(migrationsDir, "1772083000000_initial-schema.mjs");

      const result = await validateMigrationDirectory({ migrationsDir });
      expect(result.failures).toContain(
        "Invalid migration filename '1772083000000_initial-schema.mjs'. Expected pattern: ^\\d{13}_[a-z0-9_]+\\.mjs$"
      );
    });
  });

  it("passes policy validation for a valid migration set", async () => {
    await withTempDir(async (migrationsDir) => {
      const checksumsPath = path.join(migrationsDir, "checksums.json");
      await writeMigration(migrationsDir, "1772083000000_initial_schema.mjs");

      await writeChecksumsManifest({ migrationsDir, checksumsPath });

      const result = await validateMigrationPolicy({ migrationsDir, checksumsPath });
      expect(result.ok).toBe(true);
      expect(result.failures).toEqual([]);
      expect(result.migrationFiles).toEqual(["1772083000000_initial_schema.mjs"]);
    });
  });

  it("fails directory validation when non-.mjs migration files are present", async () => {
    await withTempDir(async (migrationsDir) => {
      await writeMigration(migrationsDir, "1772083000000_initial_schema.mjs");
      await writeMigration(migrationsDir, "1772083000001_bad.sql", "select 1;\n");

      const result = await validateMigrationDirectory({ migrationsDir });
      expect(result.failures).toContain(
        "Non-.mjs file found in db/migrations: 1772083000001_bad.sql"
      );
    });
  });

  it("fails policy validation when checksums drift", async () => {
    await withTempDir(async (migrationsDir) => {
      const checksumsPath = path.join(migrationsDir, "checksums.json");
      const fileName = "1772083000000_initial_schema.mjs";
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
      await writeMigration(migrationsDir, "1772083000002_second.mjs");
      await writeMigration(migrationsDir, "1772083000001_first.mjs");

      const checksums = await calculateMigrationChecksums({ migrationsDir });
      await writeChecksumsManifest({ migrationsDir, checksumsPath });

      const manifest = JSON.parse(await readFile(checksumsPath, "utf8"));
      expect(Object.keys(manifest.files)).toEqual([
        "1772083000001_first.mjs",
        "1772083000002_second.mjs"
      ]);
      expect(manifest.files["1772083000001_first.mjs"]).toBe(checksums["1772083000001_first.mjs"]);
      expect(manifest.files["1772083000002_second.mjs"]).toBe(
        checksums["1772083000002_second.mjs"]
      );
    });
  });
});
