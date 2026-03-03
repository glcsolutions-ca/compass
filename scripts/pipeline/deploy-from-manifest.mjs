import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, optionalOption, requireOption } from "./cli-utils.mjs";
import { readJsonFile } from "./pipeline-contract-lib.mjs";
import { validateReleaseCandidateFile } from "./validate-release-candidate.mjs";

const ALLOWED_ENVIRONMENTS = new Set(["acceptance", "production"]);

function resolveManifestPath(options) {
  return optionalOption(options, "manifest") ?? process.env.MANIFEST_PATH;
}

export async function deployFromManifest({ environment, manifestPath }) {
  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    throw new Error("Invalid --env value. Expected one of: acceptance, production");
  }

  if (!manifestPath || manifestPath.trim().length === 0) {
    throw new Error("Manifest path is required via --manifest or MANIFEST_PATH");
  }

  const normalizedManifestPath = manifestPath.trim();
  const errors = await validateReleaseCandidateFile(normalizedManifestPath);
  if (errors.length > 0) {
    const details = errors.map((entry) => `- ${entry.path}: ${entry.message}`).join("\n");
    throw new Error(`Manifest validation failed for deploy command:\n${details}`);
  }

  const manifest = await readJsonFile(normalizedManifestPath);
  const artifacts = manifest.artifacts;

  console.info(
    `Deploy contract check passed for '${environment}' using candidate '${manifest.candidateId}'.`
  );
  console.info(`Manifest: ${path.resolve(normalizedManifestPath)}`);
  console.info(`apiImage=${artifacts.apiImage}`);
  console.info(`webImage=${artifacts.webImage}`);
  console.info(`workerImage=${artifacts.workerImage}`);
  console.info(`migrationsArtifact=${artifacts.migrationsArtifact}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const environment = requireOption(options, "env");
  const manifestPath = resolveManifestPath(options);

  await deployFromManifest({
    environment,
    manifestPath
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
