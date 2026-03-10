import { GITHUB_ENVIRONMENT_NAMES } from "../../config/public-metadata.mjs";
import { REQUIRED_REPO_VARIABLE_NAMES } from "../../config/live-config.mjs";

function normalizeNames(entries = []) {
  return new Set(
    entries
      .map((entry) => (typeof entry?.name === "string" ? entry.name.trim() : ""))
      .filter(Boolean)
  );
}

export function findMissingRepositoryVariables(
  existingVariables,
  requiredVariableNames = REQUIRED_REPO_VARIABLE_NAMES
) {
  const existing = normalizeNames(existingVariables);
  return requiredVariableNames.filter((name) => !existing.has(name)).sort();
}

export function findEnvironmentScopedConfigViolations({
  environmentNames = GITHUB_ENVIRONMENT_NAMES,
  environmentVariablesByName = {},
  environmentSecretsByName = {}
} = {}) {
  const violations = [];

  for (const environmentName of environmentNames) {
    const variableNames = [...normalizeNames(environmentVariablesByName[environmentName])].sort();
    const secretNames = [...normalizeNames(environmentSecretsByName[environmentName])].sort();

    if (variableNames.length > 0) {
      violations.push(
        `Environment '${environmentName}' still has variables: ${variableNames.join(", ")}`
      );
    }

    if (secretNames.length > 0) {
      violations.push(
        `Environment '${environmentName}' still has secrets: ${secretNames.join(", ")}`
      );
    }
  }

  return violations;
}

export function assertCanonicalGithubConfig({
  repositoryVariables,
  requiredVariableNames = REQUIRED_REPO_VARIABLE_NAMES,
  environmentNames = GITHUB_ENVIRONMENT_NAMES,
  environmentVariablesByName = {},
  environmentSecretsByName = {}
}) {
  const missingVariables = findMissingRepositoryVariables(repositoryVariables, requiredVariableNames);
  const scopedViolations = findEnvironmentScopedConfigViolations({
    environmentNames,
    environmentVariablesByName,
    environmentSecretsByName
  });

  const issues = [
    ...missingVariables.map((name) => `Missing repository variable '${name}'`),
    ...scopedViolations
  ];

  if (issues.length > 0) {
    throw new Error(
      `Canonical GitHub configuration violations:\n${issues.map((issue) => `- ${issue}`).join("\n")}`
    );
  }
}
