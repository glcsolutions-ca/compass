import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function main({ cwd = process.cwd() } = {}) {
  const manifestPath = path.join(cwd, "packages/codex-protocol/codex-version.json");
  if (!existsSync(manifestPath)) {
    fail("CODP001 missing packages/codex-protocol/codex-version.json");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    fail("CODP002 invalid codex protocol manifest JSON");
    return;
  }

  const generatedTag =
    manifest && typeof manifest.generatedTag === "string" ? manifest.generatedTag.trim() : "";
  if (!generatedTag) {
    fail("CODP003 codex protocol manifest must include generatedTag");
    return;
  }

  const versionRoot = path.join(cwd, "packages/codex-protocol/generated", generatedTag);
  const tsRoot = path.join(versionRoot, "ts");
  const jsonRoot = path.join(versionRoot, "json");
  const jsonBundlePath = path.join(jsonRoot, "codex_app_server_protocol.schemas.json");

  if (!existsSync(tsRoot)) {
    fail(`CODP004 missing generated TypeScript protocol directory: ${path.relative(cwd, tsRoot)}`);
    return;
  }

  if (!existsSync(jsonRoot)) {
    fail(`CODP005 missing generated JSON schema directory: ${path.relative(cwd, jsonRoot)}`);
    return;
  }

  if (!existsSync(jsonBundlePath)) {
    fail(
      `CODP006 missing codex schema bundle: ${path.relative(cwd, jsonBundlePath)} (run pnpm codex:protocol:generate)`
    );
    return;
  }

  const runtimeCoreDtsPath = path.join(cwd, "packages/codex-runtime-core/src/index.d.ts");
  if (existsSync(runtimeCoreDtsPath)) {
    const dts = readFileSync(runtimeCoreDtsPath, "utf8");
    if (!dts.includes("@compass/codex-protocol")) {
      fail(
        "CODP007 runtime core declarations must reference @compass/codex-protocol to prevent handwritten protocol drift"
      );
      return;
    }
  }

  console.info(`Codex protocol policy passed (CODP000) [${generatedTag}]`);
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main();
}

export { main as runCodexProtocolCheck };
