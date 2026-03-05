import { spawn } from "node:child_process";
import path from "node:path";
import { ensureLocalEnv } from "./ensure-local-env.mjs";

function runCommand(command, args, cwd, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0 || allowFailure) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${String(code)}`));
    });
  });
}

async function up(rootDir) {
  await ensureLocalEnv({ rootDir });

  try {
    await runCommand(
      "docker",
      [
        "compose",
        "--env-file",
        path.resolve(rootDir, "db/postgres/.env"),
        "-f",
        path.resolve(rootDir, "db/postgres/docker-compose.yml"),
        "up",
        "-d",
        "--wait",
        "postgres"
      ],
      rootDir
    );
  } catch {
    // Some Docker Compose versions intermittently fail wait attachment.
    await runCommand(
      "docker",
      [
        "compose",
        "--env-file",
        path.resolve(rootDir, "db/postgres/.env"),
        "-f",
        path.resolve(rootDir, "db/postgres/docker-compose.yml"),
        "up",
        "-d",
        "postgres"
      ],
      rootDir
    );
  }

  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "db/scripts/wait-for-postgres.mjs")],
    rootDir
  );
  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "db/scripts/check-migration-policy.mjs")],
    rootDir
  );
  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "db/scripts/migrate.mjs"), "up"],
    rootDir
  );
  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "db/scripts/seed-postgres.mjs")],
    rootDir
  );
  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "scripts/dev/runtime-session.mjs"), "up"],
    rootDir
  );

  console.info("dev-stack: services are ready.");
}

async function down(rootDir) {
  await ensureLocalEnv({ rootDir });

  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "scripts/dev/runtime-session.mjs"), "down"],
    rootDir,
    { allowFailure: true }
  );

  await runCommand(
    "docker",
    [
      "compose",
      "--env-file",
      path.resolve(rootDir, "db/postgres/.env"),
      "-f",
      path.resolve(rootDir, "db/postgres/docker-compose.yml"),
      "down"
    ],
    rootDir,
    { allowFailure: true }
  );

  console.info("dev-stack: services are down.");
}

async function status(rootDir) {
  await ensureLocalEnv({ rootDir });

  await runCommand(
    process.execPath,
    [path.resolve(rootDir, "scripts/dev/runtime-session.mjs"), "status"],
    rootDir,
    { allowFailure: true }
  );

  await runCommand(
    "docker",
    [
      "compose",
      "--env-file",
      path.resolve(rootDir, "db/postgres/.env"),
      "-f",
      path.resolve(rootDir, "db/postgres/docker-compose.yml"),
      "ps"
    ],
    rootDir,
    { allowFailure: true }
  );
}

async function main() {
  const action = process.argv[2];
  const rootDir = process.cwd();

  if (!action || !["up", "down", "status"].includes(action)) {
    console.error("Usage: node scripts/dev/dev-stack.mjs <up|down|status>");
    process.exitCode = 1;
    return;
  }

  if (action === "up") {
    await up(rootDir);
    return;
  }

  if (action === "down") {
    await down(rootDir);
    return;
  }

  await status(rootDir);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
