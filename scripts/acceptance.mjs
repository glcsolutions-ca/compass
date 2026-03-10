import { runCommand } from "../platform/pipeline/shared/scripts/command-runner.mjs";
import { reserveFreePort } from "../platform/pipeline/shared/scripts/reserve-free-port.mjs";
import {
  buildDiagnosticsPath,
  prepareLocalCandidate
} from "../platform/pipeline/stages/01-commit-stage/scripts/prepare-local-candidate.mjs";

async function main() {
  const candidate = await prepareLocalCandidate();
  const apiHostPort = await reserveFreePort();
  let webHostPort = await reserveFreePort();
  while (webHostPort === apiHostPort) {
    webHostPort = await reserveFreePort();
  }
  await runCommand(process.execPath, [
    "platform/pipeline/stages/02-acceptance-stage/scripts/run-acceptance-from-candidate.mjs",
    "--manifest",
    candidate.manifestPath,
    "--diagnostics-dir",
    buildDiagnosticsPath("acceptance"),
    "--suite",
    "api",
    "--suite",
    "web",
    "--api-host-port",
    String(apiHostPort),
    "--web-host-port",
    String(webHostPort)
  ]);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
