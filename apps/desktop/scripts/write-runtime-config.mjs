import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const startUrl = process.env.COMPASS_DESKTOP_START_URL?.trim();

if (!startUrl) {
  throw new Error("COMPASS_DESKTOP_START_URL is required when building desktop installers.");
}

const parsedStartUrl = new URL(startUrl);
const isLoopback = ["localhost", "127.0.0.1"].includes(parsedStartUrl.hostname);
if (parsedStartUrl.protocol !== "https:" && !isLoopback) {
  throw new Error(
    `COMPASS_DESKTOP_START_URL must use HTTPS (or localhost for local tests): ${startUrl}`
  );
}

const outputPath = path.join(process.cwd(), "dist", "desktop-runtime.json");
await mkdir(path.dirname(outputPath), { recursive: true });

const payload = {
  schemaVersion: "1",
  generatedAt: new Date().toISOString(),
  startUrl: parsedStartUrl.toString()
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.info(`Wrote desktop runtime config to ${outputPath}`);
