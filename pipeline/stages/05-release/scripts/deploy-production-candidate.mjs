import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { deployFromManifest } from "../../../shared/scripts/deploy-from-manifest.mjs";
import { assertCandidateArtifactsAvailable } from "../../../shared/scripts/assert-candidate-artifacts-available.mjs";

export async function deployProductionCandidate(manifestPath) {
  await deployFromManifest({
    environment: "production",
    manifestPath
  });

  await assertCandidateArtifactsAvailable(manifestPath);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const manifestPath = requireOption(options, "manifest");
  await deployProductionCandidate(manifestPath);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
