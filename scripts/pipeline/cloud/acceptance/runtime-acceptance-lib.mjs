import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireEnv } from "../../shared/pipeline-utils.mjs";

const execFileAsync = promisify(execFile);

export function requireCandidateRefs() {
  const contractStatus = String(process.env.CANDIDATE_REF_CONTRACT_STATUS || "unknown").trim();
  if (contractStatus !== "pass") {
    throw new Error(`Candidate ref contract status is ${contractStatus}`);
  }

  const apiRef = requireEnv("CANDIDATE_API_REF");
  const webRef = process.env.CANDIDATE_WEB_REF?.trim() || "";
  const codexRef = process.env.CANDIDATE_CODEX_REF?.trim() || "";

  if (!apiRef.includes("@sha256:")) {
    throw new Error(`Candidate API image is not digest-pinned: ${apiRef}`);
  }
  if (webRef && !webRef.includes("@sha256:")) {
    throw new Error(`Candidate Web image is not digest-pinned: ${webRef}`);
  }
  if (codexRef && !codexRef.includes("@sha256:")) {
    throw new Error(`Candidate Codex image is not digest-pinned: ${codexRef}`);
  }

  return { apiRef, webRef, codexRef };
}

export async function runShell(script) {
  await execFileAsync("bash", ["-lc", script], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 1024 * 1024 * 20
  });
}
