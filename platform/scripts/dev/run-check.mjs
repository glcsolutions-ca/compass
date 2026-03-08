import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const PRODUCT_PACKAGES = [
  "@compass/api",
  "@compass/web",
  "@compass/desktop",
  "@compass/ui",
  "@compass/contracts",
  "@compass/sdk",
  "@compass/database"
];

const COMMIT_PACKAGES = [
  "@compass/api",
  "@compass/web",
  "@compass/contracts",
  "@compass/sdk",
  "@compass/database"
];

function turboFilterArgs(packages) {
  return packages.flatMap((workspaceName) => ["--filter", workspaceName]);
}

function turboRunArgs(task, packages, extraTaskArgs = []) {
  const args = ["turbo", "run", task, ...turboFilterArgs(packages)];
  if (extraTaskArgs.length > 0) {
    args.push("--", ...extraTaskArgs);
  }
  return args;
}

function turboTestArgs(packages) {
  return [
    "turbo",
    "run",
    "test",
    ...turboFilterArgs(packages),
    "--ui=stream",
    "--log-order=grouped",
    "--",
    "--silent=passed-only",
    "--reporter=dot"
  ];
}

const CHECK_SUITES = {
  product: [
    ["pnpm", ["--filter", "@compass/database", "run", "migrate:check"]],
    ["pnpm", ["format:check"]],
    ["pnpm", turboRunArgs("lint", PRODUCT_PACKAGES, ["--max-warnings=0"])],
    ["pnpm", turboRunArgs("typecheck", PRODUCT_PACKAGES)],
    ["pnpm", turboTestArgs(PRODUCT_PACKAGES)],
    ["node", ["platform/scripts/dev/assert-generated-artifacts-stable.mjs"]],
    ["node", ["platform/scripts/dev/audit-legacy-references.mjs"]]
  ],
  commit: [
    ["pnpm", ["--filter", "@compass/database", "run", "migrate:check"]],
    ["pnpm", ["format:check"]],
    ["pnpm", turboRunArgs("lint", COMMIT_PACKAGES, ["--max-warnings=0"])],
    ["pnpm", turboRunArgs("typecheck", COMMIT_PACKAGES)],
    ["pnpm", turboTestArgs(COMMIT_PACKAGES)],
    ["pnpm", ["--filter", "@compass/web", "build"]],
    ["node", ["platform/scripts/dev/assert-generated-artifacts-stable.mjs"]]
  ]
};

function usage() {
  console.error("Usage: node platform/scripts/dev/run-check.mjs <product|commit>");
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited from signal ${signal}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${String(code)}`));
        return;
      }

      resolve();
    });
  });
}

async function main(argv) {
  const mode = argv[2];
  if (mode !== "product" && mode !== "commit") {
    usage();
    process.exitCode = 1;
    return;
  }

  for (const [command, args] of CHECK_SUITES[mode]) {
    await run(command, args);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
