import { execFile } from "node:child_process";
import { chmod } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

async function main() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      env: process.env
    });
    const repoRoot = String(stdout || "").trim();
    if (!repoRoot) {
      return;
    }

    const hooksPath = path.join(repoRoot, ".githooks");
    await execFileAsync("git", ["config", "core.hooksPath", hooksPath], {
      cwd: repoRoot,
      env: process.env
    });
    await chmod(path.join(hooksPath, "pre-push"), 0o755);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Skipping git hook installation: ${message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
