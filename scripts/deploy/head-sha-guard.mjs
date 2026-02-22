import { appendGithubOutput, getHeadSha, getTier, run, writeDeployArtifact } from "./utils.mjs";

const remoteName = process.env.DEPLOY_REMOTE?.trim() || "origin";
const branchName = process.env.DEPLOY_BRANCH?.trim() || "main";
const headSha = getHeadSha();

async function main() {
  await run("git", ["fetch", remoteName, branchName, "--depth=1"]);
  const { stdout } = await run("git", ["rev-parse", `${remoteName}/${branchName}`]);

  const remoteHeadSha = stdout.trim();
  const matches = remoteHeadSha === headSha;

  const artifactPath = await writeDeployArtifact("head-sha-guard", {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    tier: getTier(),
    remote: remoteName,
    branch: branchName,
    remoteHeadSha,
    status: matches ? "pass" : "fail"
  });

  await appendGithubOutput({
    head_sha_guard_path: artifactPath,
    remote_head_sha: remoteHeadSha,
    head_sha_matches: String(matches)
  });

  if (!matches) {
    throw new Error(
      `Refusing deploy: HEAD_SHA=${headSha} is stale, latest ${remoteName}/${branchName} is ${remoteHeadSha}`
    );
  }

  console.info(`head-sha-guard passed for ${headSha}`);
}

void main();
