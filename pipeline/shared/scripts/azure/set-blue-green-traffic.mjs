import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../cli-utils.mjs";
import { runAz } from "./az-command.mjs";

async function setAppLabelTraffic({
  resourceGroup,
  appName,
  primaryLabel,
  primaryWeight,
  secondaryLabel,
  secondaryWeight
}) {
  await runAz([
    "containerapp",
    "ingress",
    "traffic",
    "set",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--label-weight",
    `${primaryLabel}=${primaryWeight}`,
    `${secondaryLabel}=${secondaryWeight}`
  ]);
}

export async function setBlueGreenTraffic({
  resourceGroup,
  apiAppName,
  webAppName,
  primaryLabel,
  primaryWeight,
  secondaryLabel,
  secondaryWeight
}) {
  await setAppLabelTraffic({
    resourceGroup,
    appName: apiAppName,
    primaryLabel,
    primaryWeight,
    secondaryLabel,
    secondaryWeight
  });

  await setAppLabelTraffic({
    resourceGroup,
    appName: webAppName,
    primaryLabel,
    primaryWeight,
    secondaryLabel,
    secondaryWeight
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  await setBlueGreenTraffic({
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    primaryLabel: requireOption(options, "primary-label"),
    primaryWeight: requireOption(options, "primary-weight"),
    secondaryLabel: requireOption(options, "secondary-label"),
    secondaryWeight: requireOption(options, "secondary-weight")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
