import { acceptanceWebPolicy } from "./lib/local-stack-policy.mjs";
import {
  ROOT_DIR,
  pnpmCommand,
  runCommand,
  runWorkflowWithLocalStackPolicy
} from "./lib/local-stack.mjs";
import { getScriptArgs } from "./lib/script-args.mjs";

async function main() {
  const extraArgs = getScriptArgs();

  await runWorkflowWithLocalStackPolicy(acceptanceWebPolicy, async ({ env, reused }) => {
    console.info(
      reused
        ? "test:acceptance:web: reusing local stack."
        : "test:acceptance:web: starting local stack."
    );
    await runCommand(
      pnpmCommand(),
      [
        "exec",
        "playwright",
        "test",
        "tests/acceptance/web/e2e",
        "--config",
        "tests/acceptance/web/e2e/playwright.config.ts",
        "--reporter=line",
        "--workers=1",
        ...extraArgs
      ],
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
