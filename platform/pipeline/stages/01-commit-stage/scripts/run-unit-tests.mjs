import { pathToFileURL } from "node:url";
import { runCommand } from "../../../shared/scripts/command-runner.mjs";

export async function runUnitTests() {
  await runCommand("pnpm", [
    "turbo",
    "run",
    "test",
    "--filter=!@compass/pipeline-tools",
    "--ui=stream",
    "--log-order=grouped",
    "--",
    "--silent=passed-only",
    "--reporter=dot"
  ]);
  await runCommand("pnpm", ["--filter", "@compass/pipeline-tools", "test"]);
}

export async function main() {
  await runUnitTests();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
