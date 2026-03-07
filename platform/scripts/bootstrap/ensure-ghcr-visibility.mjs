import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadProductionConfig } from "../infra/platform-config.mjs";

const execFileAsync = promisify(execFile);
const PACKAGE_LOOKUP_RETRIES = 12;
const PACKAGE_LOOKUP_DELAY_MS = 5000;

async function gh(args) {
  const { stdout } = await execFileAsync("gh", args, {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  return String(stdout || "").trim();
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function getPackage(owner, packageName) {
  const output = await gh([
    "api",
    "-H",
    "Accept: application/vnd.github+json",
    `orgs/${owner}/packages/container/${packageName}`
  ]);
  return JSON.parse(output);
}

function buildVisibilityHelp(owner, packageName, packageHtmlUrl) {
  const packageSettingsUrl = `${packageHtmlUrl}/settings`;
  const orgPackagesSettingsUrl = `https://github.com/organizations/${owner}/settings/packages`;
  return [
    `GHCR package is not public: ${packageName}`,
    `GitHub does not expose a supported API to change container package visibility in this workflow.`,
    `Set the package visibility to public in GitHub UI, then rerun the workflow.`,
    `Package settings: ${packageSettingsUrl}`,
    `Org package defaults: ${orgPackagesSettingsUrl}`
  ].join("\n");
}

async function verifyPackagePublic(owner, packageName) {
  for (let attempt = 1; attempt <= PACKAGE_LOOKUP_RETRIES; attempt += 1) {
    try {
      const pkg = await getPackage(owner, packageName);
      if (pkg.visibility !== "public") {
        throw new Error(buildVisibilityHelp(owner, packageName, pkg.html_url));
      }
      console.info(`GHCR package is public: ${packageName}`);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("HTTP 404")) {
        throw error;
      }
      if (attempt === PACKAGE_LOOKUP_RETRIES) {
        throw new Error(`GHCR package not found after retries: ${packageName}`);
      }
      console.info(
        `GHCR package not found yet, retrying (${attempt}/${PACKAGE_LOOKUP_RETRIES}): ${packageName}`
      );
      await sleep(PACKAGE_LOOKUP_DELAY_MS);
    }
  }
}

export async function ensureGhcrVisibility() {
  const config = await loadProductionConfig();
  const owner = config.repository.split("/")[0];
  for (const packageName of config.ghcrPackages) {
    await verifyPackagePublic(owner, packageName);
  }
}

export async function main() {
  await ensureGhcrVisibility();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
