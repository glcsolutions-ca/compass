import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { promoteCandidateAzure } from "../../../shared/scripts/azure/promote-candidate-azure.mjs";

export async function promoteProductionCandidate({ manifestPath, rehearsalEvidencePath }) {
  await promoteCandidateAzure({
    manifestPath,
    rehearsalEvidencePath
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  await promoteProductionCandidate({
    manifestPath: requireOption(options, "manifest"),
    rehearsalEvidencePath: requireOption(options, "rehearsal-evidence")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
