import { defineConfig } from "@playwright/test";

const baseURL = process.env.WEB_BASE_URL ?? "http://localhost:3000";
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
