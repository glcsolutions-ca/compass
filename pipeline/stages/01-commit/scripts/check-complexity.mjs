import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { parseCliArgs, optionalOption } from "../../../shared/scripts/cli-utils.mjs";

function runEslint(maxComplexity) {
  const args = [
    "exec",
    "eslint",
    "apps/api/src",
    "apps/web/app",
    "apps/worker/src",
    "--ext",
    ".ts,.tsx",
    "--max-warnings=0",
    "--ignore-pattern",
    "**/*.test.ts",
    "--ignore-pattern",
    "**/*.test.tsx",
    "--rule",
    `complexity:[\"error\",${maxComplexity}]`
  ];

  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: process.env
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Complexity gate failed (max complexity ${maxComplexity}).`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const maxComplexityRaw = optionalOption(options, "max") ?? "20";
  const maxComplexity = Number(maxComplexityRaw);

  if (!Number.isInteger(maxComplexity) || maxComplexity < 1) {
    throw new Error("--max must be a positive integer.");
  }

  runEslint(maxComplexity);
  console.info(`Complexity gate passed (max complexity ${maxComplexity}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
