import { runAz } from "../../../shared/scripts/azure/az-command.mjs";

async function getContainerApp(resourceGroup, appName) {
  return runAz(["containerapp", "show", "--resource-group", resourceGroup, "--name", appName]);
}

export async function getContainerAppImage(resourceGroup, appName) {
  const app = await getContainerApp(resourceGroup, appName);
  return String(app?.properties?.template?.containers?.[0]?.image || "").trim();
}

export async function getContainerAppBaseUrl(resourceGroup, appName) {
  const app = await getContainerApp(resourceGroup, appName);
  const fqdn = String(app?.properties?.configuration?.ingress?.fqdn || "").trim();
  if (!fqdn) {
    throw new Error(`Unable to resolve ingress FQDN for ${appName}`);
  }
  return `https://${fqdn}`;
}

export async function updateContainerApp({ resourceGroup, appName, image, env = {}, minReplicas }) {
  const envPairs = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  const args = [
    "containerapp",
    "update",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--image",
    image
  ];
  if (envPairs.length > 0) {
    args.push("--set-env-vars", ...envPairs);
  }
  if (typeof minReplicas === "number") {
    args.push("--min-replicas", String(minReplicas));
  }
  await runAz(args, { output: "none" });
}

export async function fetchStatus(url, { redirect = "follow" } = {}) {
  const response = await fetch(url, { redirect });
  const location = response.headers.get("location") || "";
  return {
    status: response.status,
    location,
    body: await response.text()
  };
}
