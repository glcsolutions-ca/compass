import { pathToFileURL } from "node:url";
import { PreflightError, printPreflightError, runTestFullPreflight } from "./lib/test-full-preflight.mjs";

async function main() {
  try {
    await runTestFullPreflight();
  } catch (error) {
    if (error instanceof PreflightError) {
      printPreflightError(error);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
