import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function parseBrowserMode(argv) {
  let browserMode = null;

  for (const arg of argv) {
    if (arg === "--open") {
      browserMode = "open";
      continue;
    }

    if (arg === "--no-open") {
      browserMode = "no-open";
      continue;
    }

    throw new Error(`Unsupported argument for pnpm dev: ${arg}`);
  }

  return browserMode;
}

export function shouldOpenBrowser(browserMode, env = process.env) {
  if (browserMode === "open") {
    return true;
  }

  if (browserMode === "no-open") {
    return false;
  }

  return env.BROWSER?.trim().toLowerCase() !== "none";
}

function resolveBrowserCommand(url) {
  if (process.platform === "darwin") {
    return { command: "open", args: [url] };
  }

  if (process.platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }

  return { command: "xdg-open", args: [url] };
}

export async function openBrowserUrl(url) {
  const { command, args } = resolveBrowserCommand(url);

  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      detached: true,
      stdio: "ignore"
    });

    child.once("error", () => {
      resolve(false);
    });
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}
