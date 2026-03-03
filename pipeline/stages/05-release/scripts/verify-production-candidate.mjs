import { pathToFileURL } from "node:url";
import { optionalOption, parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { verifyFromManifest } from "../../../shared/scripts/verify-from-manifest.mjs";

const REQUEST_TIMEOUT_MS = 15000;

async function assertUrlResponds(url) {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Production verification failed for ${url}: HTTP ${response.status}`);
  }
}

export async function verifyProductionCandidate({ manifestPath, apiBaseUrl, webBaseUrl }) {
  await verifyFromManifest({
    environment: "production",
    manifestPath
  });

  await assertUrlResponds(`${apiBaseUrl.replace(/\/$/u, "")}/health`);
  if (webBaseUrl) {
    await assertUrlResponds(webBaseUrl.replace(/\/$/u, ""));
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const manifestPath = requireOption(options, "manifest");
  const apiBaseUrl = requireOption(options, "api-base-url");
  const webBaseUrl = optionalOption(options, "web-base-url");

  await verifyProductionCandidate({
    manifestPath,
    apiBaseUrl,
    webBaseUrl
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
