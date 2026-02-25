#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

const DEFAULT_DOCKERFILE = "apps/codex-app-server/Dockerfile";
const DEFAULT_INSTALL_ROOT = ".tools/codex";
const RELEASES_BASE_URL = "https://api.github.com/repos/openai/codex/releases";

function usage() {
  console.log(
    [
      "Usage: node scripts/codex/install-pinned-openai-codex.mjs [options]",
      "",
      "Options:",
      "  --dockerfile <path>  Dockerfile to read the pinned CODEX_TAG from.",
      "  --tag <release-tag>  Override pinned Dockerfile tag.",
      "  --asset <name>       Override auto-detected local platform asset.",
      "  --out <dir>          Install root (default: .tools/codex).",
      "  --help               Show this message."
    ].join("\n")
  );
}

function parseArgs(argv) {
  const parsed = {
    dockerfile: DEFAULT_DOCKERFILE,
    tag: null,
    asset: null,
    out: DEFAULT_INSTALL_ROOT
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--") {
      continue;
    }

    if (current === "--help" || current === "-h") {
      usage();
      process.exit(0);
    }

    if (
      current === "--dockerfile" ||
      current === "--tag" ||
      current === "--asset" ||
      current === "--out"
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${current}`);
      }
      index += 1;
      if (current === "--dockerfile") {
        parsed.dockerfile = value;
      } else if (current === "--tag") {
        parsed.tag = value;
      } else if (current === "--asset") {
        parsed.asset = value;
      } else {
        parsed.out = value;
      }
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return parsed;
}

function readRequiredMatch(source, pattern, label) {
  const match = source.match(pattern);
  if (!match?.groups?.value) {
    throw new Error(`Could not find ${label}`);
  }
  return match.groups.value;
}

function resolvePlatformAsset() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "codex-aarch64-apple-darwin.tar.gz";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "codex-x86_64-apple-darwin.tar.gz";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "codex-x86_64-unknown-linux-gnu.tar.gz";
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "codex-aarch64-unknown-linux-gnu.tar.gz";
  }

  throw new Error(`Unsupported platform/arch: ${process.platform}/${process.arch}`);
}

function toSha256(digest) {
  if (typeof digest !== "string") {
    return null;
  }
  const match = digest.match(/^sha256:(?<value>[a-f0-9]{64})$/i);
  return match?.groups?.value.toLowerCase() ?? null;
}

async function fetchRelease(tag) {
  const endpoint = `${RELEASES_BASE_URL}/tags/${encodeURIComponent(tag)}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "compass-codex-pinned-installer"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return response.json();
}

async function downloadAndHash(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      "User-Agent": "compass-codex-pinned-installer"
    },
    redirect: "follow"
  });

  if (!response.ok || !response.body) {
    const body = await response.text();
    throw new Error(`Download failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const output = createWriteStream(destinationPath);
  const hash = createHash("sha256");
  const source = Readable.fromWeb(response.body);

  for await (const chunk of source) {
    hash.update(chunk);
    output.write(chunk);
  }

  await new Promise((resolveDone, rejectDone) => {
    output.on("error", rejectDone);
    output.on("finish", resolveDone);
    output.end();
  });

  return hash.digest("hex").toLowerCase();
}

async function extractTarGz(archivePath, destinationDir) {
  await new Promise((resolveDone, rejectDone) => {
    const child = spawn("tar", ["-xzf", archivePath, "-C", destinationDir], {
      stdio: "inherit"
    });
    child.on("error", rejectDone);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveDone();
        return;
      }
      rejectDone(new Error(`tar exited with status ${code}`));
    });
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const dockerfilePath = resolve(cwd, args.dockerfile);
  const dockerfileContent = await readFile(dockerfilePath, "utf8");
  const pinnedTag = readRequiredMatch(
    dockerfileContent,
    /^ARG CODEX_TAG=(?<value>.+)$/m,
    "CODEX_TAG"
  );
  const tag = args.tag ?? pinnedTag;
  const assetName = args.asset ?? resolvePlatformAsset();

  const release = await fetchRelease(tag);
  const asset = release.assets?.find((entry) => entry?.name === assetName);
  if (!asset) {
    throw new Error(`Release ${tag} does not contain asset: ${assetName}`);
  }

  const expectedSha = toSha256(asset.digest);
  if (!expectedSha) {
    throw new Error(`Asset digest missing or unsupported for ${assetName}`);
  }

  const installRoot = resolve(cwd, args.out);
  const installDir = join(installRoot, tag, `${process.platform}-${process.arch}`);
  const targetBinaryPath = join(installDir, "codex");
  const currentBinaryPath = join(installRoot, "current", "codex");
  const binaryInArchive = assetName.replace(/\.tar\.gz$/, "");

  const workDir = await mkdtemp(join(tmpdir(), "compass-codex-install-"));
  const archivePath = join(workDir, assetName);

  try {
    const downloadedSha = await downloadAndHash(asset.browser_download_url, archivePath);
    if (downloadedSha !== expectedSha) {
      throw new Error(
        `Digest mismatch for ${assetName}: expected ${expectedSha}, got ${downloadedSha}`
      );
    }

    await extractTarGz(archivePath, workDir);
    const extractedBinaryPath = join(workDir, binaryInArchive);
    await mkdir(dirname(targetBinaryPath), { recursive: true });
    await copyFile(extractedBinaryPath, targetBinaryPath);
    await chmod(targetBinaryPath, 0o755);
    await mkdir(dirname(currentBinaryPath), { recursive: true });
    await copyFile(extractedBinaryPath, currentBinaryPath);
    await chmod(currentBinaryPath, 0o755);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }

  console.log(
    JSON.stringify(
      {
        tag,
        asset: assetName,
        sha256: expectedSha,
        binaryPath: targetBinaryPath,
        currentBinaryPath,
        exportHint: `export CODEX_BIN_PATH=${currentBinaryPath}`
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
