import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { resolveDatabaseUrl } from "./constants.mjs";

const require = createRequire(import.meta.url);
const cliPath = require.resolve("node-pg-migrate/bin/node-pg-migrate");
const command = process.argv[2];
const extraArgs = process.argv.slice(3);
const migrationsDir = path.resolve("db/migrations");
const databaseUrl = resolveDatabaseUrl();
// Scratch-drill trigger marker: intentionally non-functional.
const supportedCommands = new Set(["create", "up", "down", "redo"]);

if (!command || !supportedCommands.has(command)) {
  console.error("Usage: node db/scripts/migrate.mjs <create|up|down|redo> [args]");
  process.exit(1);
}

const args = [cliPath, command, "--migrations-dir", migrationsDir, ...extraArgs];

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
