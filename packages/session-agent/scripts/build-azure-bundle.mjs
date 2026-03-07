import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const requireFromPackageRoot = createRequire(path.join(packageRoot, "package.json"));
const { build } = requireFromPackageRoot("esbuild");

const outdir = path.join(packageRoot, "dist");

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(packageRoot, "src", "azure-agent-entry.js")],
  outfile: path.join(outdir, "azure-agent-bundle.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: false,
  logLevel: "info"
});
