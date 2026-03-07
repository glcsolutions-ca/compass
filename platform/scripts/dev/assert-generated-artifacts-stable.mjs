import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const GENERATED_ARTIFACTS = [
  "packages/contracts/openapi/openapi.json",
  "packages/sdk/src/generated/schema.ts"
];

async function readArtifact(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function runCommand(command, args) {
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

async function main() {
  const before = new Map();

  for (const artifact of GENERATED_ARTIFACTS) {
    before.set(artifact, await readArtifact(artifact));
  }

  await runCommand("pnpm", ["--filter", "@compass/contracts", "run", "generate"]);
  await runCommand("pnpm", ["--filter", "@compass/sdk", "run", "generate"]);

  const changed = [];
  for (const artifact of GENERATED_ARTIFACTS) {
    const previous = before.get(artifact);
    const current = await readArtifact(artifact);
    if (previous !== current) {
      changed.push(artifact);
    }
  }

  if (changed.length > 0) {
    throw new Error(`Generated artifacts changed during stability check:\n${changed.join("\n")}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
