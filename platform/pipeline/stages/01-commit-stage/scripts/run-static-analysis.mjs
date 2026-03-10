import { pathToFileURL } from "node:url";
import { runCommand } from "../../../shared/scripts/command-runner.mjs";

export async function runStaticAnalysis() {
  const productLineFilters = ["--filter=@compass/api...", "--filter=@compass/web..."];

  await runCommand("pnpm", [
    "turbo",
    "run",
    "lint",
    ...productLineFilters,
    "--",
    "--max-warnings=0"
  ]);
  await runCommand("pnpm", ["turbo", "run", "typecheck", ...productLineFilters]);
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
