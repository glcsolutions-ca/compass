import { runAz } from './az-command.mjs';

function normalizeAppName(appName) {
  return String(appName || '').trim().toLowerCase();
}

export function normalizeAppFqdn(fqdn) {
  return String(fqdn || '')
    .trim()
    .replace(/^https?:\/\//u, '')
    .replace(/\/+$/u, '');
}

function splitAppFqdn(appName, appFqdn) {
  const normalizedName = normalizeAppName(appName);
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

export function findLabelTraffic(showDocument, label) {
  const traffic = showDocument?.properties?.configuration?.ingress?.traffic;
  if (!Array.isArray(traffic)) {
    return undefined;
  }

  return traffic.find((entry) => entry?.label === label);
}

function getLabelWeight(showDocument, label) {
  return Number(findLabelTraffic(showDocument, label)?.weight || 0);
}

export function resolveActiveLabelFromShow(showDocument, blueLabel, greenLabel) {
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

export function findCurrentTrafficRevision(showDocument) {
  const traffic = showDocument?.properties?.configuration?.ingress?.traffic;
  if (Array.isArray(traffic)) {
    const active = traffic.find((entry) => Number(entry?.weight || 0) > 0 && entry?.revisionName);
    if (typeof active?.revisionName === 'string' && active.revisionName.trim().length > 0) {
      return active.revisionName.trim();
    }
  }

  const latest = showDocument?.properties?.latestRevisionName;
  if (typeof latest === 'string' && latest.trim().length > 0) {
    return latest.trim();
  }

  return undefined;
}

export function findRevisionByName(revisions, revisionName) {
  return revisions.find((entry) => entry?.name === revisionName);
}

export function listActiveRevisionNames(revisions) {
  return revisions
    .filter((entry) => entry?.properties?.active === true && typeof entry?.name === 'string')
    .map((entry) => entry.name);
}

export function determineRevisionsToDeactivate({ activeRevisionNames, keepRevisionNames }) {
  const keep = new Set((keepRevisionNames || []).filter(Boolean));
  return (activeRevisionNames || []).filter((revisionName) => revisionName && !keep.has(revisionName));
}

export async function showContainerApp({ resourceGroup, appName }) {
  return runAz(['containerapp', 'show', '--resource-group', resourceGroup, '--name', appName]);
}
