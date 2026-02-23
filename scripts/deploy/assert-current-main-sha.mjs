import { requireEnv, run } from "./utils.mjs";

async function main() {
  const headSha = requireEnv("HEAD_SHA");
  const remote = process.env.DEPLOY_GIT_REMOTE?.trim() || "origin";
  const branch = process.env.DEPLOY_GIT_BRANCH?.trim() || "main";

  await run("git", ["fetch", "--no-tags", "--prune", "--depth=1", remote, branch]);
  const { stdout: currentMainHead } = await run("git", ["rev-parse", `${remote}/${branch}`]);

  if (headSha !== currentMainHead) {
    throw new Error(
      `Refusing stale deploy candidate ${headSha}; current ${remote}/${branch} is ${currentMainHead}`
    );
  }

  console.info(`Deploy candidate is current ${remote}/${branch} head: ${headSha}`);
}

void main();
