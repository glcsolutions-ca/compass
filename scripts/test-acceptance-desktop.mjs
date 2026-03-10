import { acceptanceDesktopPolicy } from "./lib/local-stack-policy.mjs";
import {
  ROOT_DIR,
  pnpmCommand,
  runCommand,
  runWorkflowWithLocalStackPolicy
} from "./lib/local-stack.mjs";
import { getScriptArgs } from "./lib/script-args.mjs";

async function main() {
  const extraArgs = getScriptArgs();

  await runWorkflowWithLocalStackPolicy(acceptanceDesktopPolicy, async ({ env }) => {
    await runCommand(
      pnpmCommand(),
      ["exec", "tsx", "tests/acceptance/desktop/smoke.ts", ...extraArgs],
      {
        cwd: ROOT_DIR,
        env
      }
    );
  });
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
