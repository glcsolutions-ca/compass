import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const values: Record<string, string> = {};
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match) {
      continue;
    }

    const key = match[1];
    const rawValue = match[2].trim();
    const value =
      rawValue.length > 1 &&
      ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'")))
        ? rawValue.slice(1, -1)
        : rawValue;
    values[key] = value;
  }

  return values;
}

function resolveBaseUrl(): string {
  if (process.env.WEB_BASE_URL) {
    return process.env.WEB_BASE_URL;
  }

  if (process.env.WEB_PORT) {
    return `http://localhost:${process.env.WEB_PORT}`;
  }

  const webEnvPath = path.resolve(REPO_ROOT, "apps/web/.env");
  const webEnv = parseEnvFile(webEnvPath);
  if (webEnv.WEB_PORT) {
    return `http://localhost:${webEnv.WEB_PORT}`;
  }

  return "http://localhost:3000";
}

const baseURL = resolveBaseUrl();
const useManagedWebServer = process.env.WEB_BASE_URL === undefined;

export default defineConfig({
  testDir: "./",
  testMatch: ["smoke.spec.ts"],
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: "line",
  webServer: useManagedWebServer
    ? {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
    : undefined,
  use: {
    headless: true,
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  }
});
