import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "./cli-utils.mjs";
import { readJsonFile, validateReleaseCandidateDocument } from "./pipeline-contract-lib.mjs";

export async function validateReleaseCandidateFile(filePath) {
  const document = await readJsonFile(filePath);
  return validateReleaseCandidateDocument(document);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const filePath = requireOption(options, "file");

  const errors = await validateReleaseCandidateFile(filePath);
  if (errors.length > 0) {
    console.error(`Release-candidate validation failed for ${path.resolve(filePath)}:`);
    for (const entry of errors) {
      console.error(`- ${entry.path}: ${entry.message}`);
    }
    process.exit(1);
  }

  console.info(`Release-candidate validation passed: ${path.resolve(filePath)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
