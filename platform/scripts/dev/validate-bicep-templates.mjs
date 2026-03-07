import { readdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve("platform/infra/azure");

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".bicep")) {
      yield fullPath;
    }
  }
}

export async function validateBicepTemplates(root = ROOT) {
  const files = [];
  for await (const filePath of walk(root)) {
    files.push(filePath);
  }
  files.sort();

  for (const filePath of files) {
    await execFileAsync("az", ["bicep", "build", "--stdout", "--file", filePath], {
      env: process.env,
      maxBuffer: 20 * 1024 * 1024
    });
    console.info(`validated ${path.relative(process.cwd(), filePath)}`);
  }
}

export async function main() {
  await validateBicepTemplates();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
