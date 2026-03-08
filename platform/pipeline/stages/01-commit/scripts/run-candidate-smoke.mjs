import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { runCandidateRuntimeChecks } from "../../02-acceptance/scripts/run-acceptance-from-candidate.mjs";

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  await runCandidateRuntimeChecks({
    manifestPath: requireOption(options, "manifest"),
    outputDir: requireOption(options, "diagnostics-dir"),
    includeBrowserSmoke: false,
    includeSystemSmoke: true
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
