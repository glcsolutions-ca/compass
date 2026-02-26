import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

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
    server: {
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
