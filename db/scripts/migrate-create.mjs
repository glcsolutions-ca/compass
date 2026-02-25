import path from "node:path";
import { writeFile } from "node:fs/promises";
import {
  MIGRATIONS_DIR,
  validateMigrationDirectory,
  writeChecksumsManifest
} from "./migration-policy-lib.mjs";

function formatUtcTimestamp(date) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  const ms = String(date.getUTCMilliseconds()).padStart(3, "0");
  return `${year}${month}${day}${hour}${minute}${second}${ms}`;
}

function normalizeMigrationName(rawName) {
  const normalized = String(rawName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .replace(/_+/gu, "_");

  if (!normalized) {
    throw new Error("Migration name must include at least one alphanumeric character.");
  }

  return normalized;
}

function buildTemplate(fileName) {
  return `export const shorthands = undefined;

export async function up(pgm) {
  // TODO(${fileName}): add forward-only migration steps.
}

export async function down(_pgm) {
  // Down migrations are local-only and should not be used for production rollback.
}
`;
}

async function main() {
  const migrationName = process.argv[2];
  if (!migrationName) {
    console.error("Usage: node db/scripts/migrate-create.mjs <migration_name>");
    process.exit(1);
  }

  const directoryValidation = await validateMigrationDirectory();
  if (directoryValidation.failures.length > 0) {
    console.error("Cannot create migration because current migration directory is invalid:");
    for (const failure of directoryValidation.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  const normalizedName = normalizeMigrationName(migrationName);
  const timestamp = formatUtcTimestamp(new Date());
  const fileName = `${timestamp}_${normalizedName}.mjs`;
  const filePath = path.join(MIGRATIONS_DIR, fileName);

  await writeFile(filePath, buildTemplate(fileName), {
    encoding: "utf8",
    flag: "wx"
  });

  await writeChecksumsManifest();

  console.info(`Created migration ${filePath}`);
  console.info("Updated db/migrations/checksums.json");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
