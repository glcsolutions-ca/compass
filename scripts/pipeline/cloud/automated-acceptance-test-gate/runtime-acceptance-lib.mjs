import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireEnv } from "../../shared/pipeline-utils.mjs";

const execFileAsync = promisify(execFile);

export function requireReleasePackageRefs() {
  const contractStatus = String(
    process.env.RELEASE_CANDIDATE_REF_CONTRACT_STATUS || "unknown"
  ).trim();
  if (contractStatus !== "pass") {
    throw new Error(`Release candidate ref contract status is ${contractStatus}`);
  }

  const apiRef = requireEnv("RELEASE_CANDIDATE_API_REF");
  const webRef = requireEnv("RELEASE_CANDIDATE_WEB_REF");
  const codexRef = requireEnv("RELEASE_CANDIDATE_CODEX_REF");
  const workerRef = requireEnv("RELEASE_CANDIDATE_WORKER_REF");

  for (const [name, ref] of [
    ["API", apiRef],
    ["Web", webRef],
    ["Codex", codexRef],
    ["Worker", workerRef]
  ]) {
    if (!ref.includes("@sha256:")) {
      throw new Error(`Release candidate ${name} image is not digest-pinned: ${ref}`);
    }
  }

  return { apiRef, webRef, codexRef, workerRef };
}

export async function runShell(script) {
  await execFileAsync("bash", ["-lc", script], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 1024 * 1024 * 20
  });
}
