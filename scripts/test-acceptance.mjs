import { ROOT_DIR, pnpmCommand, runCommand } from "./lib/local-stack.mjs";
import { getScriptArgs } from "./lib/script-args.mjs";

async function main() {
  if (getScriptArgs().length > 0) {
    throw new Error("Usage: pnpm test:acceptance");
  }

  await runCommand(pnpmCommand(), ["test:acceptance:api"], { cwd: ROOT_DIR });
  await runCommand(pnpmCommand(), ["test:acceptance:web"], { cwd: ROOT_DIR });
  await runCommand(pnpmCommand(), ["test:acceptance:desktop"], { cwd: ROOT_DIR });
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
