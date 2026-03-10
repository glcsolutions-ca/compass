import {
  ROOT_DIR,
  areServicesHealthy,
  resolveLocalRuntimeEnv,
  runLocalStack,
  waitForLocalStackHealth
} from "./lib/local-stack.mjs";
import { devPolicy } from "./lib/local-stack-policy.mjs";
import { openBrowserUrl, parseBrowserMode, shouldOpenBrowser } from "./lib/open-browser.mjs";
import { getScriptArgs } from "./lib/script-args.mjs";

function waitForExitSignal() {
  return new Promise((resolve) => {
    const cleanup = () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };

    const onSigint = () => {
      cleanup();
      resolve(130);
    };

    const onSigterm = () => {
      cleanup();
      resolve(143);
    };

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);
  });
}

async function openLocalBrowser(env, browserMode) {
  const url = env.WEB_BASE_URL;

  if (!shouldOpenBrowser(browserMode, process.env)) {
    console.info(`web: local app is ready at ${url}`);
    return;
  }

  const opened = await openBrowserUrl(url);
  if (!opened) {
    console.info(`web: browser open failed. Visit ${url}`);
  }
}

async function main() {
  const browserMode = parseBrowserMode(getScriptArgs());
  const { env } = await resolveLocalRuntimeEnv({ rootDir: ROOT_DIR });
  const reused = await areServicesHealthy(devPolicy.requiredServices, env);

  if (reused) {
    console.info("web: reusing running local stack.");
    await openLocalBrowser(env, browserMode);
    process.exitCode = await waitForExitSignal();
    return;
  }

  const stackTask = runLocalStack({ rootDir: ROOT_DIR, env });

  const browserAbortController = new AbortController();
  const browserTask = waitForLocalStackHealth(env, { signal: browserAbortController.signal })
    .then(async () => await openLocalBrowser(env, browserMode))
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
