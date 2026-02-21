import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: ["smoke.spec.ts"],
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: "line",
  use: {
    headless: true,
    baseURL: process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000"
  }
});
