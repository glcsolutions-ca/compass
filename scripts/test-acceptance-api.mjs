import { acceptanceApiPolicy } from "./lib/local-stack-policy.mjs";
import {
  ROOT_DIR,
  pnpmCommand,
  runCommand,
  runWorkflowWithLocalStackPolicy
} from "./lib/local-stack.mjs";
import { getScriptArgs } from "./lib/script-args.mjs";

async function main() {
  const extraArgs = getScriptArgs();

  await runWorkflowWithLocalStackPolicy(acceptanceApiPolicy, async ({ env, reused }) => {
    console.info(
      reused
        ? "test:acceptance:api: reusing local stack."
        : "test:acceptance:api: starting local stack."
    );
    await runCommand(
      pnpmCommand(),
      ["exec", "tsx", "tests/acceptance/api/system/smoke.ts", ...extraArgs],
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
