import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT_DIR = path.resolve(scriptsDir, "..");
export const MIGRATIONS_DIR = path.join(PACKAGE_ROOT_DIR, "migrations");
export const CHECKSUMS_PATH = path.join(MIGRATIONS_DIR, "checksums.json");
export const POSTGRES_DIR = path.join(PACKAGE_ROOT_DIR, "postgres");
export const SEEDS_DIR = path.join(PACKAGE_ROOT_DIR, "seeds");
