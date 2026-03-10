import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { withCandidateRuntime } from "../../../shared/scripts/run-candidate-runtime.mjs";
import { runApiSmoke } from "./run-api-smoke.mjs";

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await withCandidateRuntime(
    {
      manifestPath: requireOption(options, "manifest"),
      outputDir: requireOption(options, "diagnostics-dir"),
      apiHostPort: Number(options["api-host-port"] || "3001"),
      webHostPort: Number(options["web-host-port"] || "3000"),
      includeWebImage: true
    },
    async (runtime) =>
      runApiSmoke({
        baseUrl: runtime.apiBaseUrl,
        outputDir: runtime.diagnosticsDir,
        headSha: runtime.manifest.source.revision,
        testedSha: runtime.manifest.source.revision
      })
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
