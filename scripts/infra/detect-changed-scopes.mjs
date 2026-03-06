import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../pipeline/shared/scripts/cli-utils.mjs";

const execFileAsync = promisify(execFile);

async function gitChangedFiles(revision) {
  const { stdout } = await execFileAsync(
    "git",
    ["diff-tree", "--no-commit-id", "--name-only", "-r", revision],
    { env: process.env, maxBuffer: 20 * 1024 * 1024 }
  );
  return String(stdout || "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function classifyChangedScopes(files) {
  const infraChanged = files.some((file) => file.startsWith("infra/azure/"));
  return {
    infraChanged,
    files
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const revision = requireOption(options, "revision");
  const result = classifyChangedScopes(await gitChangedFiles(revision));
  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
