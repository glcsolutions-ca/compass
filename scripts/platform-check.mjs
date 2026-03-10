import { pathToFileURL } from "node:url";
import { platformCheck } from "../platform/scripts/platform/reconcile-platform.mjs";

export async function main() {
  await platformCheck();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
