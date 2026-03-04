import { pathToFileURL } from "node:url";
import { buildCandidateId } from "./pipeline-contract-lib.mjs";
import { parseCliArgs, requireOption } from "./cli-utils.mjs";

export function computeCandidateId({ sourceRevision }) {
  return buildCandidateId(sourceRevision);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const sourceRevision = requireOption(options, "source-revision");

  const candidateId = computeCandidateId({ sourceRevision });
  process.stdout.write(candidateId);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
