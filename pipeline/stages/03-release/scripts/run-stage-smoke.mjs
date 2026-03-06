import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { fetchStatus } from "./release-azure-lib.mjs";

export async function runStageSmoke({ apiBaseUrl, webBaseUrl }) {
  const health = await fetchStatus(`${apiBaseUrl}/health`);
  if (health.status !== 200) {
    throw new Error(`Stage API health failed with status ${health.status}`);
  }

  const web = await fetchStatus(`${webBaseUrl}/`);
  if (web.status !== 200) {
    throw new Error(`Stage Web failed with status ${web.status}`);
  }

  const auth = await fetchStatus(`${webBaseUrl}/v1/auth/entra/start?returnTo=%2Fchat`, {
    redirect: "manual"
  });
  if (![302, 303, 307, 308].includes(auth.status)) {
    throw new Error(`Stage auth start did not redirect; status=${auth.status}`);
  }
  const expectedRedirect = `${webBaseUrl}/v1/auth/entra/callback`;
  if (!auth.location.includes(encodeURIComponent(expectedRedirect))) {
    throw new Error(
      `Stage auth redirect_uri mismatch. Expected ${expectedRedirect}; location=${auth.location}`
    );
  }

  return {
    apiBaseUrl,
    webBaseUrl,
    healthStatus: health.status,
    webStatus: web.status,
    authStatus: auth.status,
    authLocation: auth.location,
    verdict: "pass"
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const result = await runStageSmoke({
    apiBaseUrl: requireOption(options, "api-base-url"),
    webBaseUrl: requireOption(options, "web-base-url")
  });
  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
