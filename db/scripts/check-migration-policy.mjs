import {
  validateMigrationDirectory,
  validateMigrationPolicy,
  writeChecksumsManifest
} from "./migration-policy-lib.mjs";
import { createCcsError, withCcsGuardrail } from "../../scripts/pipeline/shared/ccs-contract.mjs";

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
      throw createCcsError({
        code: "MIG001",
        why: `Migration policy violations detected (${directoryValidation.failures.length}).`,
        fix: "Resolve migration directory violations before updating checksums.",
        doCommands: ["pnpm db:migrate:check"],
        ref: "docs/agents/workflow-playbook.md#standard-agent-loop"
      });
    }

    const result = await writeChecksumsManifest({
      migrationFiles: directoryValidation.migrationFiles
    });

    console.info(
      `Wrote migration checksums manifest: ${result.checksumsPath} (${directoryValidation.migrationFiles.length} migrations)`
    );
    return { status: "pass", code: "MIGW000" };
  }

  const result = await validateMigrationPolicy();
  if (!result.ok) {
    printFailures(result.failures);
    throw createCcsError({
      code: "MIG001",
      why: `Migration policy violations detected (${result.failures.length}).`,
      fix: "Restore migration naming/checksum contract.",
      doCommands: ["pnpm db:migrate:check"],
      ref: "docs/agents/workflow-playbook.md#standard-agent-loop"
    });
  }

  console.info(`Migration policy check passed (${result.migrationFiles.length} migrations).`);
  return { status: "pass", code: "MIG000" };
}

void withCcsGuardrail({
  guardrailId: "db.migration-policy",
  command: writeMode ? "pnpm db:migrate:checksums:update" : "pnpm db:migrate:check",
  passCode: writeMode ? "MIGW000" : "MIG000",
  passRef: "docs/agents/workflow-playbook.md#standard-agent-loop",
  run: main,
  mapError: (error) => ({
    code: "CCS_UNEXPECTED_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve migration policy runtime errors and rerun the check.",
    doCommands: [writeMode ? "pnpm db:migrate:checksums:update" : "pnpm db:migrate:check"],
    ref: "docs/ccs.md#output-format"
  })
});
