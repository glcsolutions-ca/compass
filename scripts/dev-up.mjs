import { upLocalStack } from "./lib/local-stack.mjs";

if (process.argv.length > 2) {
  console.error("Usage: pnpm dev:up");
  process.exitCode = 1;
} else {
  await upLocalStack().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
