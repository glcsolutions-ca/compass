import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { runCandidateRuntimeChecks } from "../../02-acceptance-stage/scripts/run-acceptance-from-candidate.mjs";

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await runCandidateRuntimeChecks({
    manifestPath: requireOption(options, "manifest"),
    outputDir: requireOption(options, "diagnostics-dir"),
    apiHostPort: Number(options["api-host-port"] || "3001"),
    webHostPort: Number(options["web-host-port"] || "3000"),
    suites: ["api"]
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
