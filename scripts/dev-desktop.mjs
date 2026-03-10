import {
  ROOT_DIR,
  ensureLocalStack,
  pnpmCommand,
  resolveLocalRuntimeEnv,
  runCommand
} from "./lib/local-stack.mjs";

async function main() {
  const runtime = await resolveLocalRuntimeEnv({ rootDir: ROOT_DIR });
  const env = {
    ...runtime.env,
    COMPASS_WEB_URL: runtime.env.WEB_BASE_URL
  };

  const { reused } = await ensureLocalStack({ rootDir: ROOT_DIR, env });
  console.info(
    reused ? "desktop: reusing running local web/api stack." : "desktop: starting local web/api stack."
  );
  await runCommand(pnpmCommand(), ["--filter", "@compass/desktop", "dev"], { env });
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
