import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

describe("azure bootstrap template", () => {
  it("contains session identifier placeholders", async () => {
    const source = await readFile(path.join(moduleDir, "azure-bootstrap-template.js"), "utf8");
    expect(source).toContain("__SESSION_IDENTIFIER__");
    expect(source).toContain("COMPASS_SESSION_IDENTIFIER");
  });
});
