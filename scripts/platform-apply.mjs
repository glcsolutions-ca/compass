import { pathToFileURL } from "node:url";
import { platformApply } from "../platform/scripts/platform/reconcile-platform.mjs";

function parseArgs(argv) {
  const options = {
    candidateId: "",
    resetWebClientSecret: false
  };
  const args = [...argv];

  while (args.length > 0) {
    const token = args.shift();
    if (token === "--candidate-id") {
      options.candidateId = String(args.shift() || "").trim();
      continue;
    }
    if (token === "--reset-web-client-secret") {
      options.resetWebClientSecret = true;
      continue;
    }
    throw new Error(`Unknown option '${token}'`);
  }

  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const result = await platformApply(parseArgs(argv));
  console.info(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
