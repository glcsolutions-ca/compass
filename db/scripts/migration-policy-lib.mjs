import path from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const MIGRATIONS_DIR = path.resolve("db/migrations");
export const CHECKSUMS_PATH = path.join(MIGRATIONS_DIR, "checksums.json");
export const MIGRATION_FILENAME_PATTERN = /^\d{13}_[a-z0-9_]+\.mjs$/u;
const ALLOWED_NON_MIGRATION_FILES = new Set([".gitkeep", "checksums.json"]);

function stableJsonStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function prefixFromMigrationFile(fileName) {
  const separatorIndex = fileName.indexOf("_");
  return separatorIndex === -1 ? fileName : fileName.slice(0, separatorIndex);
}

export async function validateMigrationDirectory({ migrationsDir = MIGRATIONS_DIR } = {}) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const failures = [];
  const migrationFiles = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (ALLOWED_NON_MIGRATION_FILES.has(entry.name)) {
      continue;
    }

    if (!entry.name.endsWith(".mjs")) {
      failures.push(`Non-.mjs file found in db/migrations: ${entry.name}`);
      continue;
    }

    if (!MIGRATION_FILENAME_PATTERN.test(entry.name)) {
      failures.push(
        `Invalid migration filename '${entry.name}'. Expected pattern: ^\\d{13}_[a-z0-9_]+\\.mjs$`
      );
      continue;
    }

    migrationFiles.push(entry.name);
  }

  migrationFiles.sort();

  if (migrationFiles.length === 0) {
    failures.push("No migration files found in db/migrations.");
  }

  const seenPrefixes = new Map();
  for (const fileName of migrationFiles) {
    const prefix = prefixFromMigrationFile(fileName);
    if (seenPrefixes.has(prefix)) {
      failures.push(
        `Duplicate migration timestamp prefix '${prefix}' found in '${seenPrefixes.get(prefix)}' and '${fileName}'.`
      );
    } else {
      seenPrefixes.set(prefix, fileName);
    }
  }

  return { migrationFiles, failures };
}

export async function calculateMigrationChecksums({
  migrationFiles,
  migrationsDir = MIGRATIONS_DIR
} = {}) {
  const files =
    migrationFiles ?? (await validateMigrationDirectory({ migrationsDir })).migrationFiles;
  const checksums = {};

  for (const fileName of files) {
    const filePath = path.join(migrationsDir, fileName);
    const buffer = await readFile(filePath);
    checksums[fileName] = createHash("sha256").update(buffer).digest("hex");
  }

  return checksums;
}

async function readChecksumsManifest({ checksumsPath = CHECKSUMS_PATH } = {}) {
  const raw = await readFile(checksumsPath, "utf8");
  const parsed = JSON.parse(raw);

  if (String(parsed?.schemaVersion || "") !== "1") {
    throw new Error(
      `Invalid checksums manifest schemaVersion '${parsed?.schemaVersion}'. Expected '1'.`
    );
  }

  if (String(parsed?.algorithm || "") !== "sha256") {
    throw new Error(
      `Invalid checksums manifest algorithm '${parsed?.algorithm}'. Expected 'sha256'.`
    );
  }

  if (!parsed?.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) {
    throw new Error("Invalid checksums manifest. 'files' must be an object.");
  }

  return parsed;
}

export async function writeChecksumsManifest({
  migrationsDir = MIGRATIONS_DIR,
  checksumsPath = CHECKSUMS_PATH,
  migrationFiles
} = {}) {
  const directoryValidation = await validateMigrationDirectory({ migrationsDir });
  if (directoryValidation.failures.length > 0) {
    const error = new Error(
      "Cannot write checksums manifest because migration directory is invalid."
    );
    error.failures = directoryValidation.failures;
    throw error;
  }

  const files = migrationFiles ?? directoryValidation.migrationFiles;
  const computed = await calculateMigrationChecksums({ migrationFiles: files, migrationsDir });

  const sortedFiles = {};
  for (const fileName of [...files].sort()) {
    sortedFiles[fileName] = computed[fileName];
  }

  const payload = {
    schemaVersion: "1",
    algorithm: "sha256",
    files: sortedFiles
  };

  await writeFile(checksumsPath, stableJsonStringify(payload), "utf8");

  return {
    checksumsPath,
    payload
  };
}

export async function validateMigrationPolicy({
  migrationsDir = MIGRATIONS_DIR,
  checksumsPath = CHECKSUMS_PATH
} = {}) {
  const directoryValidation = await validateMigrationDirectory({ migrationsDir });
  const failures = [...directoryValidation.failures];
  const migrationFiles = directoryValidation.migrationFiles;
  const computedChecksums =
    migrationFiles.length > 0
      ? await calculateMigrationChecksums({ migrationFiles, migrationsDir })
      : {};

  let manifest = null;

  try {
    manifest = await readChecksumsManifest({ checksumsPath });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (manifest) {
    const expectedFiles = new Set(Object.keys(manifest.files));

    for (const fileName of migrationFiles) {
      const expected = manifest.files[fileName];
      const actual = computedChecksums[fileName];
      if (!expected) {
        failures.push(`Missing checksum entry for migration '${fileName}'.`);
        continue;
      }
      if (expected !== actual) {
        failures.push(
          `Checksum drift for migration '${fileName}'. Expected ${expected}, actual ${actual}.`
        );
      }
      expectedFiles.delete(fileName);
    }

    for (const staleFile of [...expectedFiles].sort()) {
      failures.push(
        `Checksums manifest contains stale entry '${staleFile}' that is not present in db/migrations.`
      );
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    migrationFiles,
    computedChecksums,
    checksumsPath,
    manifest
  };
}
