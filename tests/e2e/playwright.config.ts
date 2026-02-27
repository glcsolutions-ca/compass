import { defineConfig } from "@playwright/test";

const baseURL = process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000";
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
        command: "pnpm --filter @compass/web dev --host 127.0.0.1 --port 3000",
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
