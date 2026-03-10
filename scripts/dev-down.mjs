import { downLocalStack } from "./lib/local-stack.mjs";

if (process.argv.length > 2) {
  console.error("Usage: pnpm dev:down");
  process.exitCode = 1;
} else {
  await downLocalStack().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
