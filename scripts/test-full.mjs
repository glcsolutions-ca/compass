import { pathToFileURL } from "node:url";
import { acceptanceWebPolicy } from "./lib/local-stack-policy.mjs";
import {
  ROOT_DIR,
  pnpmCommand,
  runCommand,
  runWorkflowWithLocalStackPolicy
} from "./lib/local-stack.mjs";
import {
  PreflightError,
  printPreflightError,
  runTestFullPreflight
} from "./lib/test-full-preflight.mjs";

async function main() {
  try {
    await runWorkflowWithLocalStackPolicy(acceptanceWebPolicy, async ({ env, reused }) => {
      console.info(reused ? "test:full: reusing local stack." : "test:full: starting local stack.");
      await runTestFullPreflight({ rootDir: ROOT_DIR, env });
      await runCommand(pnpmCommand(), ["test"], { cwd: ROOT_DIR, env });
      await runCommand(pnpmCommand(), ["test:integration"], { cwd: ROOT_DIR, env });
      await runCommand(pnpmCommand(), ["test:acceptance:web"], { cwd: ROOT_DIR, env });
    });
  } catch (error) {
    if (error instanceof PreflightError) {
      printPreflightError(error);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
