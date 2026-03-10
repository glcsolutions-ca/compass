import { pathToFileURL } from "node:url";
import { runCommand } from "../../../shared/scripts/command-runner.mjs";

export async function runIntegrationTests() {
  await runCommand("pnpm", ["--filter", "@compass/api", "test:integration"]);
}

export async function main() {
  await runIntegrationTests();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
