import {
  validateMigrationDirectory,
  validateMigrationPolicy,
  writeChecksumsManifest
} from "./migration-policy-lib.mjs";

const writeMode = process.argv.includes("--write");

function printFailures(failures) {
  console.error("Migration policy violations:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
}

async function main() {
  if (writeMode) {
    const directoryValidation = await validateMigrationDirectory();
    if (directoryValidation.failures.length > 0) {
      printFailures(directoryValidation.failures);
      process.exit(1);
    }

    const result = await writeChecksumsManifest({
      migrationFiles: directoryValidation.migrationFiles
    });

    console.info(
      `Wrote migration checksums manifest: ${result.checksumsPath} (${directoryValidation.migrationFiles.length} migrations)`
    );
    return;
  }

  const result = await validateMigrationPolicy();
  if (!result.ok) {
    printFailures(result.failures);
    process.exit(1);
  }

  console.info(`Migration policy check passed (${result.migrationFiles.length} migrations).`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
