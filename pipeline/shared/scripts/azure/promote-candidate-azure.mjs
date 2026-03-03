import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../cli-utils.mjs";
import { readJsonFile } from "../pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "../validate-release-candidate.mjs";
import { ensureAzLogin, runAz } from "./az-command.mjs";

function assertDeploymentEntry(entry, appKey) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Rehearsal evidence missing deployment entry for ${appKey}`);
  }

  if (typeof entry.appName !== "string" || entry.appName.trim().length === 0) {
    throw new Error(`Rehearsal evidence missing appName for ${appKey}`);
  }

  if (typeof entry.candidateRevision !== "string" || entry.candidateRevision.trim().length === 0) {
    throw new Error(`Rehearsal evidence missing candidateRevision for ${appKey}`);
  }
}

async function promoteApp({ resourceGroup, appName, candidateRevision, previousRevision }) {
  const weights = [`${candidateRevision}=100`];
  if (previousRevision && previousRevision !== candidateRevision) {
    weights.push(`${previousRevision}=0`);
  }

  await runAz([
    "containerapp",
    "ingress",
    "traffic",
    "set",
    "--resource-group",
    resourceGroup,
    "--name",
    appName,
    "--revision-weight",
    ...weights
  ]);
}

export async function promoteCandidateAzure({ manifestPath, rehearsalEvidencePath }) {
  const errors = await validateReleaseCandidateFile(manifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for promotion:\n${details}`);
  }

  await ensureAzLogin();

  const manifest = await readJsonFile(manifestPath);
  const rehearsal = await readJsonFile(rehearsalEvidencePath);

  if (rehearsal?.candidateId !== manifest.candidateId) {
    throw new Error(
      `Rehearsal candidate mismatch: expected ${manifest.candidateId}, got ${rehearsal?.candidateId}`
    );
  }

  if (rehearsal?.sourceRevision !== manifest.source?.revision) {
    throw new Error(
      `Rehearsal source revision mismatch: expected ${manifest.source?.revision}, got ${rehearsal?.sourceRevision}`
    );
  }

  if (rehearsal?.verdict !== "pass") {
    throw new Error(`Rehearsal evidence is not promotable: verdict=${rehearsal?.verdict}`);
  }

  const resourceGroup = rehearsal?.deployment?.resourceGroup;
  if (typeof resourceGroup !== "string" || resourceGroup.trim().length === 0) {
    throw new Error("Rehearsal evidence missing deployment.resourceGroup");
  }

  const api = rehearsal?.deployment?.apps?.api;
  const web = rehearsal?.deployment?.apps?.web;
  const worker = rehearsal?.deployment?.apps?.worker;

  assertDeploymentEntry(api, "api");
  assertDeploymentEntry(web, "web");
  assertDeploymentEntry(worker, "worker");

  await promoteApp({
    resourceGroup,
    appName: api.appName,
    candidateRevision: api.candidateRevision,
    previousRevision: api.previousRevision
  });

  await promoteApp({
    resourceGroup,
    appName: web.appName,
    candidateRevision: web.candidateRevision,
    previousRevision: web.previousRevision
  });

  await promoteApp({
    resourceGroup,
    appName: worker.appName,
    candidateRevision: worker.candidateRevision,
    previousRevision: worker.previousRevision
  });

  return {
    candidateId: manifest.candidateId,
    resourceGroup
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  const result = await promoteCandidateAzure({
    manifestPath: requireOption(options, "manifest"),
    rehearsalEvidencePath: requireOption(options, "rehearsal-evidence")
  });

  console.info(
    `Promotion complete for ${result.candidateId} in resource group ${result.resourceGroup}.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
