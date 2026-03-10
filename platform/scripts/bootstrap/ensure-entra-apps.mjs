import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ensureAzLogin, runAz } from "../../pipeline/shared/scripts/azure/az-command.mjs";
import { loadProductionConfig } from "../infra/platform-config.mjs";

const OUTPUT_PATH = path.resolve("bootstrap/.artifacts/entra-apps.json");
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = ["api://AzureADTokenExchange"];

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readPreviousOutput(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return {};
  }
}

async function getAppByDisplayName(displayName) {
  const apps = await runAz(["ad", "app", "list", "--display-name", displayName], {
    output: "json"
  });
  return Array.isArray(apps) ? apps.find((app) => app.displayName === displayName) : undefined;
}

async function ensureAppRegistration(displayName, options = {}) {
  const redirectUris = [...new Set((options.redirectUris || []).filter(Boolean))];
  const existing = await getAppByDisplayName(displayName);
  if (existing) {
    if (redirectUris.length > 0) {
      await runAz(
        ["ad", "app", "update", "--id", existing.appId, "--web-redirect-uris", ...redirectUris],
        {
          output: "none"
        }
      );
    }
    return existing;
  }

  const args = ["ad", "app", "create", "--display-name", displayName];
  if (redirectUris.length > 0) {
    args.push("--web-redirect-uris", ...redirectUris);
  }
  return runAz(args);
}

async function ensureServicePrincipal(appId) {
  try {
    return await runAz(["ad", "sp", "show", "--id", appId]);
  } catch {
    return runAz(["ad", "sp", "create", "--id", appId]);
  }
}

async function ensureRoleAssignment({ scope, principalId, principalType, roleName }) {
  const existing = await runAz(
    [
      "role",
      "assignment",
      "list",
      "--scope",
      scope,
      "--assignee-object-id",
      principalId,
      "--query",
      `[?roleDefinitionName=='${roleName}']`
    ],
    { output: "json" }
  );
  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }
  await runAz(
    [
      "role",
      "assignment",
      "create",
      "--scope",
      scope,
      "--assignee-object-id",
      principalId,
      "--assignee-principal-type",
      principalType,
      "--role",
      roleName
    ],
    { output: "none" }
  );
}

async function ensureFederatedCredential(appObjectId, credential) {
  const existing = await runAz(["ad", "app", "federated-credential", "list", "--id", appObjectId]);
  const match = Array.isArray(existing)
    ? existing.find((entry) => entry.name === credential.name)
    : undefined;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "compass-fic-"));
  const filePath = path.join(tempDir, "credential.json");
  try {
    await writeJson(filePath, credential);
    if (match) {
      await runAz(
        [
          "ad",
          "app",
          "federated-credential",
          "update",
          "--id",
          appObjectId,
          "--federated-credential-id",
          match.id,
          "--parameters",
          `@${filePath}`
        ],
        { output: "none" }
      );
    } else {
      await runAz(
        [
          "ad",
          "app",
          "federated-credential",
          "create",
          "--id",
          appObjectId,
          "--parameters",
          `@${filePath}`
        ],
        {
          output: "none"
        }
      );
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function maybeRotateWebClientSecret(webAppId, resetWebClientSecret) {
  if (!resetWebClientSecret) {
    return "";
  }

  const credential = await runAz([
    "ad",
    "app",
    "credential",
    "reset",
    "--id",
    webAppId,
    "--append",
    "--display-name",
    "compass-bootstrap"
  ]);

  return String(credential?.password || "").trim();
}

export async function ensureEntraApps({
  stageWebFqdn,
  prodWebFqdn,
  resetWebClientSecret = false
} = {}) {
  await ensureAzLogin();
  const config = await loadProductionConfig();
  await runAz(["account", "set", "--subscription", config.subscriptionId], {
    output: "none"
  });
  const previousOutput = await readPreviousOutput(OUTPUT_PATH);
  const redirectUriPath = config.entra.redirectUriPath;
  const redirectUris = [
    `${config.webBaseUrl}${redirectUriPath}`,
    prodWebFqdn ? `https://${prodWebFqdn}${redirectUriPath}` : "",
    stageWebFqdn ? `https://${stageWebFqdn}${redirectUriPath}` : ""
  ].filter(Boolean);

  const apiApp = await ensureAppRegistration(config.entra.apiAppDisplayName);
  const webApp = await ensureAppRegistration(config.entra.webAppDisplayName, { redirectUris });
  const deployApp = await ensureAppRegistration(config.entra.deployAppDisplayName);
  const deployServicePrincipal = await ensureServicePrincipal(deployApp.appId);
  const githubEnvironments =
    Array.isArray(config.githubEnvironments) && config.githubEnvironments.length > 0
      ? config.githubEnvironments
      : [config.githubEnvironment];
  for (const environmentName of githubEnvironments) {
    await ensureFederatedCredential(deployApp.id, {
      name: `github-${environmentName}`,
      issuer: GITHUB_OIDC_ISSUER,
      subject: `repo:${config.repository}:environment:${environmentName}`,
      audiences: GITHUB_OIDC_AUDIENCE,
      description: `GitHub Actions ${environmentName} deployment for ${config.repository}`
    });
  }
  const resourceGroupScope = await runAz(
    ["group", "show", "--name", config.resourceGroup, "--query", "id"],
    { output: "tsv" }
  ).catch(() => "");
  if (resourceGroupScope) {
    await ensureRoleAssignment({
      scope: resourceGroupScope,
      principalId: deployServicePrincipal.id,
      principalType: "ServicePrincipal",
      roleName: "Contributor"
    });
  }

  const webClientSecret =
    (await maybeRotateWebClientSecret(webApp.appId, resetWebClientSecret)) ||
    String(previousOutput.webClientSecret || "").trim();

  const output = {
    apiAppId: apiApp.id,
    apiClientId: apiApp.appId,
    webAppId: webApp.id,
    webClientId: webApp.appId,
    webClientSecret,
    deployAppId: deployApp.id,
    deployClientId: deployApp.appId,
    redirectUris
  };

  await writeJson(OUTPUT_PATH, output);
  console.info(`Wrote Entra app metadata: ${OUTPUT_PATH}`);
  return output;
}

export async function main(argv = process.argv.slice(2)) {
  const stageWebFqdnArgIndex = argv.indexOf("--stage-web-fqdn");
  const stageWebFqdn =
    stageWebFqdnArgIndex >= 0 ? String(argv[stageWebFqdnArgIndex + 1] || "").trim() : "";
  const prodWebFqdnArgIndex = argv.indexOf("--prod-web-fqdn");
  const prodWebFqdn =
    prodWebFqdnArgIndex >= 0 ? String(argv[prodWebFqdnArgIndex + 1] || "").trim() : "";
  const resetWebClientSecret = argv.includes("--reset-web-client-secret");
  await ensureEntraApps({ stageWebFqdn, prodWebFqdn, resetWebClientSecret });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
