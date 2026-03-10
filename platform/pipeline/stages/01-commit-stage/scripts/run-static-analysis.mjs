import { pathToFileURL } from "node:url";
import { runCommand } from "../../../shared/scripts/command-runner.mjs";

export async function runStaticAnalysis() {
  await runCommand("pnpm", ["lint"]);
  await runCommand("pnpm", ["typecheck"]);
}

export async function main() {
  await runStaticAnalysis();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
