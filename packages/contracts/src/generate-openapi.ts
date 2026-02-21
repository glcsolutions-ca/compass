import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "./openapi.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const outputPath = join(sourceDir, "..", "openapi", "openapi.json");

const document = buildOpenApiDocument();

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

process.stdout.write(`OpenAPI document generated at ${outputPath}\n`);
