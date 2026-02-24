import { spawnSync } from "node:child_process";

const allowBuildScripts =
  "esbuild,sharp,electron,fs-xattr,macos-alias";

const packages = ["electron"];
if (process.platform === "darwin") {
  packages.push("fs-xattr", "macos-alias");
}

const result = spawnSync("pnpm", ["rebuild", ...packages], {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    npm_config_allow_build_scripts: allowBuildScripts
  }
});

if (typeof result.status === "number" && result.status !== 0) {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}
