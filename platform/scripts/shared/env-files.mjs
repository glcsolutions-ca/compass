import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export function normalizeEnvValue(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseEnvContent(content) {
  return parseEnv(content);
}

export async function readEnvFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return parseEnvContent(content);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function readEnvLayer(envPath) {
  const envValues = await readEnvFile(envPath);
  const envLocalPath = `${envPath}.local`;
  const envLocalValues = await readEnvFile(envLocalPath);

  return {
    envPath,
    envLocalPath,
    envValues,
    envLocalValues
  };
}

export function resolveLayeredEnvValue({
  key,
  processEnv = process.env,
  envLocalValues = {},
  envValues = {}
}) {
  return (
    normalizeEnvValue(processEnv[key]) ??
    normalizeEnvValue(envLocalValues[key]) ??
    normalizeEnvValue(envValues[key])
  );
}

export function mergeLayeredEnv({
  processEnv = process.env,
  envLocalValues = {},
  envValues = {}
} = {}) {
  const merged = { ...envValues, ...envLocalValues };

  for (const [key, value] of Object.entries(processEnv)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  return merged;
}
