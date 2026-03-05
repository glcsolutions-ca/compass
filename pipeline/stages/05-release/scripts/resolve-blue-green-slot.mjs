import path from "node:path";
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { writeJsonFile } from "../../../shared/scripts/pipeline-contract-lib.mjs";
import { ensureAzLogin, runAz } from "../../../shared/scripts/azure/az-command.mjs";

function normalizeLabel(label, optionName) {
  const normalized = String(label || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    throw new Error(`${optionName} is required`);
  }

  if (!/^[a-z0-9-]+$/u.test(normalized)) {
    throw new Error(`${optionName} must contain only lowercase letters, numbers, and '-'`);
  }

  return normalized;
}

function normalizeAppFqdn(fqdn) {
  return String(fqdn || "")
    .trim()
    .replace(/^https?:\/\//u, "")
    .replace(/\/+$/u, "");
}

function splitAppFqdn(appName, appFqdn) {
  const normalizedName = String(appName || "")
    .trim()
    .toLowerCase();
  const normalizedFqdn = normalizeAppFqdn(appFqdn);
  const prefix = `${normalizedName}.`;

  if (!normalizedName || !normalizedFqdn || !normalizedFqdn.startsWith(prefix)) {
    throw new Error(`Unable to derive label host from app name '${appName}' and fqdn '${appFqdn}'`);
  }

  return {
    appName: normalizedName,
    domainSuffix: normalizedFqdn.slice(prefix.length)
  };
}

export function buildSlotBaseUrl(appName, label, appFqdn) {
  const parsed = splitAppFqdn(appName, appFqdn);
  return `https://${parsed.appName}---${label}.${parsed.domainSuffix}`;
}

function findLabelTraffic(showDocument, label) {
  const traffic = showDocument?.properties?.configuration?.ingress?.traffic;
  if (!Array.isArray(traffic)) {
    return undefined;
  }

  return traffic.find((entry) => entry?.label === label);
}

function resolveCurrentTrafficRevision(showDocument) {
  const traffic = showDocument?.properties?.configuration?.ingress?.traffic;
  if (Array.isArray(traffic)) {
    const active = traffic.find((entry) => Number(entry?.weight || 0) > 0 && entry?.revisionName);
    if (typeof active?.revisionName === "string" && active.revisionName.trim().length > 0) {
      return active.revisionName.trim();
    }
  }

  const latest = showDocument?.properties?.latestRevisionName;
  if (typeof latest === "string" && latest.trim().length > 0) {
    return latest.trim();
  }

  return undefined;
}

function getLabelWeight(showDocument, label) {
  const traffic = findLabelTraffic(showDocument, label);
  if (!traffic) {
    return 0;
  }

  return Number(traffic.weight || 0);
}

function resolveActiveLabelFromShow(showDocument, blueLabel, greenLabel) {
  const blueWeight = getLabelWeight(showDocument, blueLabel);
  const greenWeight = getLabelWeight(showDocument, greenLabel);

  if (blueWeight === 0 && greenWeight === 0) {
    return undefined;
  }

  if (blueWeight > greenWeight) {
    return blueLabel;
  }

  if (greenWeight > blueWeight) {
    return greenLabel;
  }

  throw new Error(
    `Unable to resolve active blue/green label because weights are tied (${blueLabel}=${blueWeight}, ${greenLabel}=${greenWeight})`
  );
}

export function resolveInactiveLabel(activeLabel, blueLabel, greenLabel) {
  if (activeLabel === blueLabel) {
    return greenLabel;
  }

  if (activeLabel === greenLabel) {
    return blueLabel;
  }

  throw new Error(
    `Active label '${activeLabel}' is not one of configured release labels (${blueLabel}, ${greenLabel})`
  );
}

async function showContainerApp({ resourceGroup, appName }) {
  return runAz(["containerapp", "show", "--resource-group", resourceGroup, "--name", appName]);
}

async function ensureMultipleRevisionsMode({ resourceGroup, appName }) {
  await runAz([
    "containerapp",
    "revision",
    "set-mode",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--mode",
    "multiple"
  ]);
}

async function ensureLabelAssignment({
  resourceGroup,
  appName,
  label,
  revisionName,
  showDocument
}) {
  const currentLabel = findLabelTraffic(showDocument, label);
  if (currentLabel?.revisionName === revisionName) {
    return;
  }

  await runAz([
    "containerapp",
    "revision",
    "label",
    "add",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--label",
    label,
    "--revision",
    revisionName,
    "--yes"
  ]);
}

async function enforceBaselineTraffic({
  resourceGroup,
  appName,
  activeLabel,
  inactiveLabel,
  showDocument
}) {
  const inactive = findLabelTraffic(showDocument, inactiveLabel);
  const args = [
    "containerapp",
    "ingress",
    "traffic",
    "set",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--label-weight",
    `${activeLabel}=100`
  ];

  if (inactive?.revisionName) {
    args.push(`${inactiveLabel}=0`);
  }

  await runAz(args);
}

async function convergeAppLabelBaseline({ resourceGroup, appName, activeLabel, inactiveLabel }) {
  await ensureMultipleRevisionsMode({ resourceGroup, appName });

  const before = await showContainerApp({ resourceGroup, appName });
  const baselineRevision = resolveCurrentTrafficRevision(before);
  if (!baselineRevision) {
    throw new Error(`Unable to determine baseline revision for ${appName}`);
  }

  await ensureLabelAssignment({
    resourceGroup,
    appName,
    label: activeLabel,
    revisionName: baselineRevision,
    showDocument: before
  });

  const afterLabel = await showContainerApp({ resourceGroup, appName });
  await enforceBaselineTraffic({
    resourceGroup,
    appName,
    activeLabel,
    inactiveLabel,
    showDocument: afterLabel
  });

  const finalState = await showContainerApp({ resourceGroup, appName });
  const fqdn = normalizeAppFqdn(finalState?.properties?.configuration?.ingress?.fqdn);
  if (!fqdn) {
    throw new Error(`Unable to resolve ingress fqdn for ${appName}`);
  }

  return {
    appName,
    fqdn,
    activeLabelRevision: findLabelTraffic(finalState, activeLabel)?.revisionName ?? "",
    inactiveLabelRevision: findLabelTraffic(finalState, inactiveLabel)?.revisionName ?? ""
  };
}

export function resolveGlobalActiveLabel({
  apiShow,
  webShow,
  preferredActiveLabel,
  blueLabel,
  greenLabel
}) {
  const apiActive = resolveActiveLabelFromShow(apiShow, blueLabel, greenLabel);
  const webActive = resolveActiveLabelFromShow(webShow, blueLabel, greenLabel);

  if (apiActive && webActive && apiActive !== webActive) {
    throw new Error(
      `API and Web active labels are inconsistent (api=${apiActive}, web=${webActive}). Resolve label drift before release.`
    );
  }

  if (apiActive) {
    return apiActive;
  }

  if (webActive) {
    return webActive;
  }

  return preferredActiveLabel;
}

export async function resolveBlueGreenSlot({
  resourceGroup,
  apiAppName,
  webAppName,
  blueLabel = "blue",
  greenLabel = "green",
  preferredActiveLabel = "blue"
}) {
  await ensureAzLogin();

  const normalizedBlueLabel = normalizeLabel(blueLabel, "blueLabel");
  const normalizedGreenLabel = normalizeLabel(greenLabel, "greenLabel");
  const normalizedPreferredActive = normalizeLabel(preferredActiveLabel, "preferredActiveLabel");

  if (normalizedBlueLabel === normalizedGreenLabel) {
    throw new Error("blueLabel and greenLabel must be different");
  }

  const apiShow = await showContainerApp({ resourceGroup, appName: apiAppName });
  const webShow = await showContainerApp({ resourceGroup, appName: webAppName });

  const activeLabel = resolveGlobalActiveLabel({
    apiShow,
    webShow,
    preferredActiveLabel: normalizedPreferredActive,
    blueLabel: normalizedBlueLabel,
    greenLabel: normalizedGreenLabel
  });
  const inactiveLabel = resolveInactiveLabel(
    activeLabel,
    normalizedBlueLabel,
    normalizedGreenLabel
  );

  const api = await convergeAppLabelBaseline({
    resourceGroup,
    appName: apiAppName,
    activeLabel,
    inactiveLabel
  });

  const web = await convergeAppLabelBaseline({
    resourceGroup,
    appName: webAppName,
    activeLabel,
    inactiveLabel
  });

  return {
    resourceGroup,
    labels: {
      blue: normalizedBlueLabel,
      green: normalizedGreenLabel,
      active: activeLabel,
      inactive: inactiveLabel
    },
    api,
    web,
    urls: {
      activeApiBaseUrl: buildSlotBaseUrl(api.appName, activeLabel, api.fqdn),
      inactiveApiBaseUrl: buildSlotBaseUrl(api.appName, inactiveLabel, api.fqdn),
      activeWebBaseUrl: buildSlotBaseUrl(web.appName, activeLabel, web.fqdn),
      inactiveWebBaseUrl: buildSlotBaseUrl(web.appName, inactiveLabel, web.fqdn)
    }
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const outputPath = optionalOption(options, "out");
  const githubOutputPath = optionalOption(options, "github-output");

  const resolution = await resolveBlueGreenSlot({
    resourceGroup: requireOption(options, "resource-group"),
    apiAppName: requireOption(options, "api-app-name"),
    webAppName: requireOption(options, "web-app-name"),
    blueLabel: optionalOption(options, "blue-label") ?? "blue",
    greenLabel: optionalOption(options, "green-label") ?? "green",
    preferredActiveLabel: optionalOption(options, "preferred-active-label") ?? "blue"
  });

  if (outputPath) {
    await writeJsonFile(outputPath, resolution);
    console.info(`Wrote blue/green slot resolution: ${path.resolve(outputPath)}`);
  }

  if (githubOutputPath) {
    const outputLines = [
      `active_label=${resolution.labels.active}`,
      `inactive_label=${resolution.labels.inactive}`,
      `api_fqdn=${resolution.api.fqdn}`,
      `web_fqdn=${resolution.web.fqdn}`,
      `active_api_base_url=${resolution.urls.activeApiBaseUrl}`,
      `inactive_api_base_url=${resolution.urls.inactiveApiBaseUrl}`,
      `active_web_base_url=${resolution.urls.activeWebBaseUrl}`,
      `inactive_web_base_url=${resolution.urls.inactiveWebBaseUrl}`
    ].join("\n");

    await appendFile(githubOutputPath, `${outputLines}\n`, "utf8");
  }

  if (!outputPath) {
    console.info(JSON.stringify(resolution, null, 2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
