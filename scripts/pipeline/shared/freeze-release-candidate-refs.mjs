import { appendGithubOutput, requireEnv } from "./pipeline-utils.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMAND_MAX_BUFFER = 1024 * 1024 * 50;

async function capture(cmd, args) {
  const { stdout } = await execFileAsync(cmd, args, {
    encoding: "utf8",
    maxBuffer: COMMAND_MAX_BUFFER
  });
  return stdout.trim();
}

async function resolveToDigestRef(acrName, image) {
  const acrRegistry = `${acrName}.azurecr.io`;
  if (!image.startsWith(`${acrRegistry}/`)) {
    throw new Error(`Image is not in expected ACR registry: ${image}`);
  }

  const repoRef = image.slice(acrRegistry.length + 1);

  if (repoRef.includes("@sha256:")) {
    const [repo, digest] = repoRef.split("@");
    const resolvedDigest = await capture("az", [
      "acr",
      "repository",
      "show",
      "--name",
      acrName,
      "--image",
      `${repo}@${digest}`,
      "--query",
      "digest",
      "--output",
      "tsv"
    ]);
    if (!resolvedDigest) {
      throw new Error(`Image digest was not found in ACR: ${image}`);
    }
    return `${acrRegistry}/${repo}@${resolvedDigest}`;
  }

  const resolvedDigest = await capture("az", [
    "acr",
    "repository",
    "show",
    "--name",
    acrName,
    "--image",
    repoRef,
    "--query",
    "digest",
    "--output",
    "tsv"
  ]);
  if (!resolvedDigest) {
    throw new Error(`Image tag was not found in ACR: ${image}`);
  }

  const repo = repoRef.includes(":") ? repoRef.split(":")[0] : repoRef;
  return `${acrRegistry}/${repo}@${resolvedDigest}`;
}

async function freezeCurrentRuntimeRefs() {
  const acrName = requireEnv("ACR_NAME");
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const apiAppName = requireEnv("ACA_API_APP_NAME");
  const webAppName = requireEnv("ACA_WEB_APP_NAME");
  const workerAppName = requireEnv("ACA_WORKER_APP_NAME");
  const codexAppName = requireEnv("ACA_CODEX_APP_NAME");

  const apiImage = await capture("az", [
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    apiAppName,
    "--query",
    "properties.template.containers[0].image",
    "--output",
    "tsv"
  ]);
  const webImage = await capture("az", [
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    webAppName,
    "--query",
    "properties.template.containers[0].image",
    "--output",
    "tsv"
  ]);
  const workerImage = await capture("az", [
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    workerAppName,
    "--query",
    "properties.template.containers[0].image",
    "--output",
    "tsv"
  ]);
  const codexImage = await capture("az", [
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    codexAppName,
    "--query",
    "properties.template.containers[0].image",
    "--output",
    "tsv"
  ]);

  const releaseCandidateApiRef = await resolveToDigestRef(acrName, apiImage);
  const releaseCandidateWebRef = await resolveToDigestRef(acrName, webImage);
  const releaseCandidateWorkerRef = await resolveToDigestRef(acrName, workerImage);
  const releaseCandidateCodexRef = await resolveToDigestRef(acrName, codexImage);

  await appendGithubOutput({
    release_candidate_api_ref: releaseCandidateApiRef,
    release_candidate_web_ref: releaseCandidateWebRef,
    release_candidate_worker_ref: releaseCandidateWorkerRef,
    release_candidate_codex_ref: releaseCandidateCodexRef
  });
}

async function main() {
  const mode = requireEnv("FREEZE_MODE");

  if (mode === "resolve-current-runtime-refs") {
    await freezeCurrentRuntimeRefs();
    return;
  }

  throw new Error(
    `Unsupported FREEZE_MODE: ${mode}. This script only supports resolve-current-runtime-refs.`
  );
}

void main();
