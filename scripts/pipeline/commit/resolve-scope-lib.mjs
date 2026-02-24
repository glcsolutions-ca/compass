export async function resolveScopeShas({ env = process.env, getCurrentSha, getParentSha } = {}) {
  if (typeof getCurrentSha !== "function") {
    throw new Error("resolveScopeShas requires getCurrentSha");
  }

  if (typeof getParentSha !== "function") {
    throw new Error("resolveScopeShas requires getParentSha");
  }

  const headSha = env.GITHUB_HEAD_SHA?.trim() || (await getCurrentSha());
  const baseSha = env.GITHUB_BASE_SHA?.trim() || (await getParentSha(headSha));
  const testedSha = env.GITHUB_TESTED_SHA?.trim() || (await getCurrentSha());

  return { baseSha, headSha, testedSha };
}
