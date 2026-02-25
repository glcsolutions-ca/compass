#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const DEFAULT_DOCKERFILE = "apps/codex-app-server/Dockerfile";
const DEFAULT_ASSET = "codex-x86_64-unknown-linux-gnu.tar.gz";
const RELEASES_BASE_URL = "https://api.github.com/repos/openai/codex/releases";

function usage() {
  console.log(
    [
      "Usage: node scripts/codex/sync-openai-codex-release.mjs [options]",
      "",
      "Options:",
      "  --dockerfile <path>  Dockerfile to update.",
      "  --asset <name>       Release asset used in Docker runtime stage.",
      "  --tag <release-tag>  Explicit release tag (e.g. rust-v0.105.0).",
      "  --dry-run            Print changes without writing the Dockerfile.",
      "  --help               Show this message."
    ].join("\n")
  );
}

function parseArgs(argv) {
  const parsed = {
    dockerfile: DEFAULT_DOCKERFILE,
    asset: DEFAULT_ASSET,
    tag: null,
    dryRun: false
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

    if (current === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (current === "--dockerfile" || current === "--asset" || current === "--tag") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${current}`);
      }
      index += 1;
      if (current === "--dockerfile") {
        parsed.dockerfile = value;
      } else if (current === "--asset") {
        parsed.asset = value;
      } else {
        parsed.tag = value;
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
    throw new Error(`Could not find ${label} in Dockerfile`);
  }
  return match.groups.value;
}

async function fetchRelease(tag) {
  const endpoint = tag
    ? `${RELEASES_BASE_URL}/tags/${encodeURIComponent(tag)}`
    : `${RELEASES_BASE_URL}/latest`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "compass-codex-release-sync"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return response.json();
}

function toSha256(digest) {
  if (typeof digest !== "string") {
    return null;
  }
  const match = digest.match(/^sha256:(?<value>[a-f0-9]{64})$/i);
  return match?.groups?.value.toLowerCase() ?? null;
}

function replaceArg(content, key, value) {
  const pattern = new RegExp(`^ARG ${key}=.*$`, "m");
  if (!pattern.test(content)) {
    throw new Error(`Missing ARG ${key} in Dockerfile`);
  }
  return content.replace(pattern, `ARG ${key}=${value}`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const dockerfilePath = resolve(process.cwd(), args.dockerfile);

  const dockerfileContent = await readFile(dockerfilePath, "utf8");
  const currentTag = readRequiredMatch(
    dockerfileContent,
    /^ARG CODEX_TAG=(?<value>.+)$/m,
    "CODEX_TAG"
  );
  const currentAsset = readRequiredMatch(
    dockerfileContent,
    /^ARG CODEX_ASSET=(?<value>.+)$/m,
    "CODEX_ASSET"
  );
  const currentSha = readRequiredMatch(
    dockerfileContent,
    /^ARG CODEX_SHA256=(?<value>[a-f0-9]{64})$/m,
    "CODEX_SHA256"
  );

  const release = await fetchRelease(args.tag);
  const asset = release.assets?.find((entry) => entry?.name === args.asset);
  if (!asset) {
    throw new Error(`Release ${release.tag_name} does not contain asset: ${args.asset}`);
  }

  const resolvedSha = toSha256(asset.digest);
  if (!resolvedSha) {
    throw new Error(
      `Asset digest missing or unsupported for ${asset.name}; expected sha256 from GitHub API`
    );
  }

  let updated = dockerfileContent;
  updated = replaceArg(updated, "CODEX_TAG", release.tag_name);
  updated = replaceArg(updated, "CODEX_ASSET", asset.name);
  updated = replaceArg(updated, "CODEX_SHA256", resolvedSha);

  if (args.dryRun) {
    console.log(`Would update ${args.dockerfile}`);
  } else if (updated !== dockerfileContent) {
    await writeFile(dockerfilePath, updated, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        dockerfile: args.dockerfile,
        from: {
          tag: currentTag,
          asset: currentAsset,
          sha256: currentSha
        },
        to: {
          tag: release.tag_name,
          asset: asset.name,
          sha256: resolvedSha
        },
        changed: updated !== dockerfileContent,
        dryRun: args.dryRun
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
