import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "../../../shared/scripts/cli-utils.mjs";
import { runCommand } from "../../../shared/scripts/command-runner.mjs";
import { withCandidateRuntime } from "../../../shared/scripts/run-candidate-runtime.mjs";

const ACCEPTANCE_SUITES = new Set(["api", "web"]);

function normalizeSuites(inputSuites) {
  const asArray =
    typeof inputSuites === "undefined"
      ? ["api", "web"]
      : Array.isArray(inputSuites)
        ? inputSuites
        : [inputSuites];

  const normalized = [...new Set(asArray.map((suite) => String(suite).trim()).filter(Boolean))];
  if (normalized.length === 0) {
    throw new Error("At least one acceptance suite is required.");
  }

  for (const suite of normalized) {
    if (!ACCEPTANCE_SUITES.has(suite)) {
      throw new Error(`Unsupported acceptance suite '${suite}'.`);
    }
  }

  return normalized;
}

export async function runAcceptanceFromCandidate({
  manifestPath,
  outputDir,
  suites = ["api", "web"],
  apiHostPort = 3001,
  webHostPort = 3000
}) {
  return runCandidateRuntimeChecks({
    manifestPath,
    outputDir,
    suites,
    apiHostPort,
    webHostPort
  });
}

export async function runCandidateRuntimeChecks({
  manifestPath,
  outputDir,
  suites = ["api"],
  apiHostPort = 3001,
  webHostPort = 3000
}) {
  const selectedSuites = normalizeSuites(suites);
  const shouldRunApiAcceptance = selectedSuites.includes("api");
  const shouldRunWebAcceptance = selectedSuites.includes("web");
  const diagnosticsDir = path.resolve(outputDir);

  await mkdir(diagnosticsDir, { recursive: true });
  return withCandidateRuntime(
    {
      manifestPath,
      outputDir: diagnosticsDir,
      includeWebImage: shouldRunWebAcceptance,
      apiHostPort,
      webHostPort
    },
    async (runtime) => {
      const manifest = runtime.manifest;
      const systemEnv = {
        ...process.env,
        HEAD_SHA: manifest.source.revision,
        TESTED_SHA: manifest.source.revision,
        BASE_URL: runtime.apiBaseUrl,
        TARGET_API_BASE_URL: runtime.apiBaseUrl
      };
      const e2eEnv = {
        ...process.env,
        WEB_BASE_URL: runtime.webBaseUrl ?? `http://127.0.0.1:${webHostPort}`
      };

      if (shouldRunApiAcceptance) {
        await runCommand("pnpm", ["acceptance:api"], {
          env: systemEnv,
          cwd: path.resolve(".")
        });
      }
      if (shouldRunWebAcceptance) {
        await runCommand("pnpm", ["acceptance:web"], {
          env: e2eEnv,
          cwd: path.resolve(".")
        });
      }
      const result = {
        schemaVersion: "acceptance-runtime.v1",
        candidateId: manifest.candidateId,
        sourceRevision: manifest.source.revision,
        suites: selectedSuites,
        apiBaseUrl: runtime.apiBaseUrl,
        webBaseUrl: runtime.webBaseUrl,
        verdict: "pass",
        completedAt: new Date().toISOString()
      };
      await writeFile(
        path.join(diagnosticsDir, "acceptance-result.json"),
        `${JSON.stringify(result, null, 2)}\n`,
        "utf8"
      );
      return result;
    }
  );
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const diagnosticsDir = requireOption(options, "diagnostics-dir");
  await runCandidateRuntimeChecks({
    manifestPath: requireOption(options, "manifest"),
    outputDir: diagnosticsDir,
    suites: options.suite,
    apiHostPort: Number(options["api-host-port"] || "3001"),
    webHostPort: Number(options["web-host-port"] || "3000")
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
