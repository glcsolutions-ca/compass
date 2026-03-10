import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  return parseEnv(readFileSync(filePath, "utf8"));
}

function resolveBaseUrl(): string {
  if (process.env.WEB_BASE_URL) {
    return process.env.WEB_BASE_URL;
  }

  if (process.env.WEB_PORT) {
    return `http://127.0.0.1:${process.env.WEB_PORT}`;
  }

  const webEnvLocalPath = path.resolve(REPO_ROOT, "apps/web/.env.local");
  const webEnvLocal = parseEnvFile(webEnvLocalPath);
  if (webEnvLocal.WEB_PORT) {
    return `http://127.0.0.1:${webEnvLocal.WEB_PORT}`;
  }

  const webEnvPath = path.resolve(REPO_ROOT, "apps/web/.env");
  const webEnv = parseEnvFile(webEnvPath);
  if (webEnv.WEB_PORT) {
    return `http://127.0.0.1:${webEnv.WEB_PORT}`;
  }

  return "http://127.0.0.1:3000";
}

const baseURL = resolveBaseUrl();
const useManagedWebServer = process.env.WEB_BASE_URL === undefined;

export default defineConfig({
  testDir: "./",
  testMatch: ["*.spec.ts"],
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: "line",
  webServer: useManagedWebServer
    ? {
        command: "pnpm dev -- --no-open",
        url: baseURL,
        env: {
          ...process.env,
          AUTH_MODE: "mock",
          AGENT_GATEWAY_ENABLED: process.env.AGENT_GATEWAY_ENABLED ?? "true",
          AGENT_CLOUD_MODE_ENABLED: process.env.AGENT_CLOUD_MODE_ENABLED ?? "true",
          AGENT_RUNTIME_PROVIDER: process.env.AGENT_RUNTIME_PROVIDER ?? "mock"
        },
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
