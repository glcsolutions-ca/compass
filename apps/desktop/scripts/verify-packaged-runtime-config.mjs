import { readFile } from "node:fs/promises";
import path from "node:path";

const runtimeConfigPath =
  process.env.DESKTOP_RUNTIME_CONFIG_PATH?.trim() ||
  path.join(process.cwd(), "dist", "desktop-runtime.json");

const raw = await readFile(runtimeConfigPath, "utf8");
const parsed = JSON.parse(raw);

if (String(parsed?.schemaVersion || "") !== "1") {
  throw new Error(`Invalid desktop runtime config schemaVersion in ${runtimeConfigPath}`);
}

const startUrl = String(parsed?.startUrl || "").trim();
if (!startUrl) {
  throw new Error(`desktop runtime config missing startUrl in ${runtimeConfigPath}`);
}

const parsedStartUrl = new URL(startUrl);
if (parsedStartUrl.protocol !== "https:") {
  throw new Error(`desktop runtime config startUrl must be HTTPS: ${startUrl}`);
}

console.info(`Desktop runtime config contract validated: ${runtimeConfigPath}`);
