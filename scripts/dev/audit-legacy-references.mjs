import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();
const THIS_FILE = fileURLToPath(import.meta.url);

const FORBIDDEN_PATTERNS = [
  { pattern: "merge_group" },
  { pattern: "00-queue-admission.yml" },
  { pattern: "AZURE_GITHUB_CLIENT_ID" },
  { pattern: "infra/identity" },
  { pattern: "bootstrap/terraform" },
  { pattern: "ACR_" },
  { pattern: "az acr import" },
  { pattern: "acceptance.parameters.json" },
  { pattern: "containerapp-worker.bicep" },
  { pattern: "servicebus.bicep" },
  { pattern: "sessionpool-dynamic-sessions.bicep" },
  { pattern: "workerImage" },
  { pattern: "production-rehearsal-evidence" }
];

const SKIP_DIRS = new Set([
  ".git",
  ".tools",
  "node_modules",
  ".turbo",
  ".artifacts",
  "dist",
  "coverage"
]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".pnpm-store")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      yield* walk(fullPath);
      continue;
    }
    yield fullPath;
  }
}

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ![
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".woff",
    ".woff2"
  ].includes(ext);
}

async function main() {
  const hits = [];

  for await (const filePath of walk(ROOT)) {
    if (!isTextFile(filePath) || filePath === THIS_FILE) {
      continue;
    }

    const relativePath = path.relative(ROOT, filePath);
    const content = await readFile(filePath, "utf8").catch(() => "");
    if (!content) {
      continue;
    }

    for (const { pattern } of FORBIDDEN_PATTERNS) {
      if (content.includes(pattern)) {
        hits.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  if (hits.length > 0) {
    throw new Error(`Forbidden legacy references still exist:\n${hits.join("\n")}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
