import { ROOT_DIR, resolveLocalRuntimeEnv, runLocalStack, waitForLocalStackHealth } from "./lib/local-stack.mjs";
import { openBrowserUrl, parseBrowserMode, shouldOpenBrowser } from "./lib/open-browser.mjs";

async function main() {
  const browserMode = parseBrowserMode(process.argv.slice(2));
  const { env } = await resolveLocalRuntimeEnv({ rootDir: ROOT_DIR });
  const stackTask = runLocalStack({ rootDir: ROOT_DIR, env });

  const browserAbortController = new AbortController();
  const browserTask = waitForLocalStackHealth(env, { signal: browserAbortController.signal })
    .then(async () => {
      const url = env.WEB_BASE_URL;

      if (!shouldOpenBrowser(browserMode, process.env)) {
        console.info(`web: local app is ready at ${url}`);
        return;
      }

      const opened = await openBrowserUrl(url);
      if (!opened) {
        console.info(`web: browser open failed. Visit ${url}`);
      }
    })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      console.error(error instanceof Error ? error.message : String(error));
    });

  try {
    const exitCode = await stackTask;
    process.exitCode = exitCode;
  } finally {
    browserAbortController.abort();
    await browserTask;
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
