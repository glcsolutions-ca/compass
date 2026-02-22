import {
  appendGithubOutput,
  getHeadSha,
  getTier,
  requireEnv,
  writeDeployArtifact
} from "./utils.mjs";

const artifactName = requireEnv("ARTIFACT_NAME");
const outputKey = process.env.ARTIFACT_OUTPUT_KEY?.trim() || "deploy_artifact_path";

async function main() {
  let body = {};
  const rawJson = process.env.ARTIFACT_JSON?.trim();

  if (rawJson) {
    try {
      body = JSON.parse(rawJson);
    } catch (error) {
      throw new Error(
        `ARTIFACT_JSON must be valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const artifactPath = await writeDeployArtifact(artifactName, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha: getHeadSha(),
    tier: getTier(),
    ...body
  });

  await appendGithubOutput({ [outputKey]: artifactPath });
  console.info(`Wrote deploy artifact: ${artifactPath}`);
}

void main();
