import { runCommand } from "../platform/pipeline/shared/scripts/command-runner.mjs";
import { reserveFreePort } from "../platform/pipeline/shared/scripts/reserve-free-port.mjs";
import {
  buildDiagnosticsPath,
  prepareLocalCandidate
} from "../platform/pipeline/stages/01-commit-stage/scripts/prepare-local-candidate.mjs";

async function main() {
  await runCommand(process.execPath, [
    "platform/pipeline/stages/01-commit-stage/scripts/run-static-analysis.mjs"
  ]);
  await runCommand(process.execPath, [
    "platform/pipeline/stages/01-commit-stage/scripts/run-unit-tests.mjs"
  ]);
  await runCommand(process.execPath, [
    "platform/pipeline/stages/01-commit-stage/scripts/run-integration-tests.mjs"
  ]);
  const candidate = await prepareLocalCandidate({ forceRebuild: true });
  const apiHostPort = await reserveFreePort();
  let webHostPort = await reserveFreePort();
  while (webHostPort === apiHostPort) {
    webHostPort = await reserveFreePort();
  }
  await runCommand(process.execPath, [
    "platform/pipeline/stages/01-commit-stage/scripts/run-candidate-smoke.mjs",
    "--manifest",
    candidate.manifestPath,
    "--diagnostics-dir",
    buildDiagnosticsPath("commit-smoke"),
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
