import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const appShellSrcDir = path.resolve(webDir, "../../packages/app-shell/src");
const contractsSrcDir = path.resolve(webDir, "../../packages/contracts/src");
const sdkSrcDir = path.resolve(webDir, "../../packages/sdk/src");
const sharedSrcDir = path.resolve(webDir, "../../packages/shared/src");
const uiSrcDir = path.resolve(webDir, "../../packages/ui/src");

function resolveWebPort(rawPort: string | undefined) {
  if (!rawPort) {
    return undefined;
  }
  if (!/^\d+$/u.test(rawPort)) {
    throw new Error(`Invalid WEB_PORT: ${rawPort}`);
  }
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`Invalid WEB_PORT: ${rawPort}`);
  }
  return parsed;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = resolveWebPort(env.WEB_PORT);
  const apiBaseUrl =
    env.VITE_API_BASE_URL?.trim() || env.API_BASE_URL?.trim() || "http://127.0.0.1:3001";

  return {
    plugins: [reactRouter(), tsconfigPaths()],
    resolve: {
      alias: [
        { find: /^~\/(.*)$/, replacement: `${appShellSrcDir}/$1` },
        { find: /^@compass\/app-shell$/, replacement: `${appShellSrcDir}/index.ts` },
        { find: /^@compass\/app-shell\/(.*)$/, replacement: `${appShellSrcDir}/$1` },
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
    server: {
      host: "0.0.0.0",
      port,
      strictPort: true,
      proxy: {
        "/v1": {
          target: apiBaseUrl,
          changeOrigin: true
        },
        "/health": {
          target: apiBaseUrl,
          changeOrigin: true
        },
        "/openapi.json": {
          target: apiBaseUrl,
          changeOrigin: true
        }
      }
    }
  };
});
