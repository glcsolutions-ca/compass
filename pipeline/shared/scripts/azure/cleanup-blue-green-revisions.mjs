import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../cli-utils.mjs";
import { ensureAzLogin, runAz } from "./az-command.mjs";
import {
  determineRevisionsToDeactivate,
  findLabelTraffic,
  listActiveRevisionNames,
  showContainerApp
} from "./blue-green-utils.mjs";

function resolveKeptRevisionNames(showDocument, labels) {
  const revisionNames = labels.map(
    (label) => findLabelTraffic(showDocument, label)?.revisionName || ""
  );

  if (revisionNames.some((revisionName) => !revisionName)) {
    throw new Error(
      `Container app is missing one or more required blue/green labels (${labels.join(", ")})`
    );
  }

  return revisionNames;
}

export async function cleanupBlueGreenRevisions({
  resourceGroup,
  appName,
  blueLabel = "blue",
  greenLabel = "green"
}) {
  await ensureAzLogin();

  const showDocument = await showContainerApp({ resourceGroup, appName });
  const keepRevisionNames = resolveKeptRevisionNames(showDocument, [blueLabel, greenLabel]);
  const revisions = await runAz([
    "containerapp",
    "revision",
    "list",
    "--resource-group",
    resourceGroup,
    "--name",
    appName
  ]);
  const activeRevisionNames = listActiveRevisionNames(revisions);
  const revisionsToDeactivate = determineRevisionsToDeactivate({
    activeRevisionNames,
    keepRevisionNames
  });

  for (const revisionName of revisionsToDeactivate) {
    await runAz([
      "containerapp",
      "revision",
      "deactivate",
      "--resource-group",
      resourceGroup,
      "--name",
      appName,
      "--revision",
      revisionName
    ]);
  }

  const finalRevisions = await runAz([
    "containerapp",
    "revision",
    "list",
    "--resource-group",
    resourceGroup,
    "--name",
    appName
  ]);
  const finalActiveRevisionNames = listActiveRevisionNames(finalRevisions);

  if (finalActiveRevisionNames.length !== 2) {
    throw new Error(
      `Container app ${appName} has ${finalActiveRevisionNames.length} active revisions after cleanup (expected 2)`
    );
  }

  for (const revisionName of finalActiveRevisionNames) {
    if (!keepRevisionNames.includes(revisionName)) {
      throw new Error(
        `Container app ${appName} still has active revision ${revisionName} outside the blue/green label pair`
      );
    }
  }

  return {
    appName,
    keepRevisionNames,
    deactivatedRevisionNames: revisionsToDeactivate,
    activeRevisionNames: finalActiveRevisionNames
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const result = await cleanupBlueGreenRevisions({
    resourceGroup: requireOption(options, "resource-group"),
    appName: requireOption(options, "app-name"),
    blueLabel: options["blue-label"],
    greenLabel: options["green-label"]
  });

  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
