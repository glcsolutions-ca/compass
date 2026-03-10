import { integrationPolicy } from "./lib/local-stack-policy.mjs";
import {
  ROOT_DIR,
  pnpmCommand,
  runCommand,
  runWorkflowWithLocalStackPolicy
} from "./lib/local-stack.mjs";
import { getScriptArgs } from "./lib/script-args.mjs";

async function main() {
  const extraArgs = getScriptArgs();

  await runWorkflowWithLocalStackPolicy(integrationPolicy, async ({ env, reused }) => {
    console.info(
      reused
        ? "test:integration: reusing local dependencies."
        : "test:integration: starting local dependencies."
    );
    await runCommand(
      pnpmCommand(),
      ["--filter", "@compass/api", "test:integration", ...extraArgs],
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
