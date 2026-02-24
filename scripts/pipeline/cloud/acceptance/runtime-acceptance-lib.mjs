import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireEnv } from "../../shared/pipeline-utils.mjs";

const execFileAsync = promisify(execFile);

export function requireReleasePackageRefs() {
  const contractStatus = String(
    process.env.RELEASE_PACKAGE_REF_CONTRACT_STATUS || "unknown"
  ).trim();
  if (contractStatus !== "pass") {
    throw new Error(`Release package ref contract status is ${contractStatus}`);
  }

  const apiRef = requireEnv("RELEASE_PACKAGE_API_REF");
  const webRef = process.env.RELEASE_PACKAGE_WEB_REF?.trim() || "";
  const codexRef = process.env.RELEASE_PACKAGE_CODEX_REF?.trim() || "";

  if (!apiRef.includes("@sha256:")) {
    throw new Error(`Release package API image is not digest-pinned: ${apiRef}`);
  }
  if (webRef && !webRef.includes("@sha256:")) {
    throw new Error(`Release package Web image is not digest-pinned: ${webRef}`);
  }
  if (codexRef && !codexRef.includes("@sha256:")) {
    throw new Error(`Release package Codex image is not digest-pinned: ${codexRef}`);
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
