import path from "node:path";
import { readFile } from "node:fs/promises";

export const PRODUCTION_PARAMETER_FILE = "infra/azure/environments/production.parameters.json";
export const PRODUCTION_BOOTSTRAP_CONFIG = "bootstrap/config/production.json";

export async function loadJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

export async function loadArmParameters(parametersFile = PRODUCTION_PARAMETER_FILE) {
  const document = await loadJson(parametersFile);
  const parameters = document?.parameters;
  if (!parameters || typeof parameters !== "object") {
    throw new Error(
      `ARM parameter file ${parametersFile} is missing a top-level parameters object`
    );
  }

  return Object.fromEntries(
    Object.entries(parameters).map(([name, descriptor]) => [name, descriptor?.value])
  );
}

export async function loadProductionConfig(configFile = PRODUCTION_BOOTSTRAP_CONFIG) {
  return loadJson(configFile);
}

export function requireParameter(parameters, name) {
  const value = parameters?.[name];
  if (typeof value === "undefined" || value === null || value === "") {
    throw new Error(`Parameter '${name}' is required`);
  }
  return value;
}
