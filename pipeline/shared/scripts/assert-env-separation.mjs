import { pathToFileURL } from "node:url";
import { parseCliArgs, requireOption } from "./cli-utils.mjs";

function normalizeUrl(urlString) {
  const normalized = new URL(urlString.trim());
  normalized.pathname = normalized.pathname.replace(/\/+$/u, "") || "/";
  normalized.search = "";
  normalized.hash = "";
  return normalized;
}

export function assertEnvironmentSeparation({ currentApi, currentWeb, peerApi, peerWeb }) {
  const comparisons = [
    {
      name: "API",
      current: normalizeUrl(currentApi),
      peer: normalizeUrl(peerApi)
    },
    {
      name: "WEB",
      current: normalizeUrl(currentWeb),
      peer: normalizeUrl(peerWeb)
    }
  ];

  const conflicts = comparisons.filter((entry) => entry.current.origin === entry.peer.origin);
  if (conflicts.length > 0) {
    const details = conflicts
      .map((entry) => `- ${entry.name}: current=${entry.current.origin} peer=${entry.peer.origin}`)
      .join("\n");
    throw new Error(
      `Environment separation check failed. Current and peer URLs overlap:\n${details}`
    );
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);

  assertEnvironmentSeparation({
    currentApi: requireOption(options, "current-api"),
    currentWeb: requireOption(options, "current-web"),
    peerApi: requireOption(options, "peer-api"),
    peerWeb: requireOption(options, "peer-web")
  });

  console.info("Environment separation check passed.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
