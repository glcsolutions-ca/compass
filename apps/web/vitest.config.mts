import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["../../packages/testkit/guardrails/commit-stage.setup.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "clover"]
    }
  }
});
