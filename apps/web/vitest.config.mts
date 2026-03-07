import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const appShellSrcDir = path.resolve(webDir, "../../packages/app-shell/src");
const contractsSrcDir = path.resolve(webDir, "../../packages/contracts/src");
const sdkSrcDir = path.resolve(webDir, "../../packages/sdk/src");
const sharedSrcDir = path.resolve(webDir, "../../packages/shared/src");
const uiSrcDir = path.resolve(webDir, "../../packages/ui/src");

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: [
      { find: /^~\/(.*)$/, replacement: `${appShellSrcDir}/$1` },
      { find: /^@compass\/contracts$/, replacement: `${contractsSrcDir}/index.ts` },
      { find: /^@compass\/contracts\/(.*)$/, replacement: `${contractsSrcDir}/$1` },
      { find: /^@compass\/sdk$/, replacement: `${sdkSrcDir}/index.ts` },
      { find: /^@compass\/sdk\/(.*)$/, replacement: `${sdkSrcDir}/$1` },
      { find: /^@compass\/shared$/, replacement: `${sharedSrcDir}/index.ts` },
      { find: /^@compass\/shared\/(.*)$/, replacement: `${sharedSrcDir}/$1` },
      { find: /^@compass\/ui$/, replacement: `${uiSrcDir}/index.ts` },
      { find: /^@compass\/ui\/(.*)$/, replacement: `${uiSrcDir}/$1` }
    ]
  },
  test: {
    environment: "jsdom",
    include: ["test/unit/**/*.unit.test.ts", "test/component/**/*.component.test.tsx"],
    setupFiles: ["../../packages/testing/guardrails/commit-stage.setup.mjs"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html", "clover"]
    }
  }
});
