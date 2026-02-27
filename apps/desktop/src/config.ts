import { readFileSync } from "node:fs";
import path from "node:path";
import { parseOriginAllowlist, toHttpOrigin } from "./navigation-policy";

export interface DesktopRuntimeConfig {
  startUrl: string;
  allowedOrigins: ReadonlySet<string>;
  isPackaged: boolean;
}

export interface ResolveDesktopRuntimeConfigOptions {
  isPackaged: boolean;
  env: NodeJS.ProcessEnv;
  resourcesPath: string;
}

interface PackagedRuntimeConfigFile {
  startUrl: string;
}

const DEFAULT_DEV_START_URL = "http://localhost:3000";
const RUNTIME_CONFIG_FILENAME = "desktop-runtime.json";
const DEFAULT_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"] as const;

function parseCommaSeparatedList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function loadPackagedRuntimeConfig(resourcesPath: string): PackagedRuntimeConfigFile {
  const runtimeConfigPath = path.join(resourcesPath, RUNTIME_CONFIG_FILENAME);
  const raw = readFileSync(runtimeConfigPath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("startUrl" in parsed) ||
    typeof parsed.startUrl !== "string"
  ) {
    throw new Error(`Invalid runtime config payload at ${runtimeConfigPath}`);
  }

  return {
    startUrl: parsed.startUrl
  };
}

function resolveStartUrl({
  isPackaged,
  env,
  resourcesPath
}: ResolveDesktopRuntimeConfigOptions): string {
  const fromEnv = env.COMPASS_DESKTOP_START_URL?.trim();

  if (!isPackaged) {
    return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_DEV_START_URL;
  }

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return loadPackagedRuntimeConfig(resourcesPath).startUrl;
}

function assertStartUrlPolicy(startUrl: string, isPackaged: boolean): void {
  const parsed = new URL(startUrl);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Desktop start URL must use HTTP(S): ${startUrl}`);
  }

  if (isPackaged && parsed.protocol !== "https:") {
    throw new Error(
      "Packaged desktop start URL must be HTTPS. Provide a secure COMPASS_DESKTOP_START_URL."
    );
  }
}

export function resolveDesktopRuntimeConfig(
  options: ResolveDesktopRuntimeConfigOptions
): DesktopRuntimeConfig {
  const startUrl = resolveStartUrl(options);
  assertStartUrlPolicy(startUrl, options.isPackaged);

  const allowlistFromEnv = parseCommaSeparatedList(options.env.COMPASS_DESKTOP_ALLOWED_ORIGINS);
  const allowedOrigins = parseOriginAllowlist(allowlistFromEnv);

  allowedOrigins.add(toHttpOrigin(startUrl));

  if (!options.isPackaged) {
    for (const origin of DEFAULT_DEV_ORIGINS) {
      allowedOrigins.add(origin);
    }
  }

  return {
    startUrl,
    allowedOrigins,
    isPackaged: options.isPackaged
  };
}
