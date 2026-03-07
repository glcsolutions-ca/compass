import assert from "node:assert/strict";
import path from "node:path";
import { access } from "node:fs/promises";

async function main() {
  const desktopEntry = path.resolve("apps/desktop/src/main/index.ts");
  await access(desktopEntry);
  assert.equal(true, true, "desktop host entry should exist");
  console.info(`desktop acceptance scaffold verified (${desktopEntry})`);
}

void main();
