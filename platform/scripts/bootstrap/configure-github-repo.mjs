import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REPOSITORY_SLUG, GITHUB_ENVIRONMENT_NAMES } from "../../config/public-metadata.mjs";
import { REQUIRED_REPO_VARIABLE_NAMES } from "../../config/live-config.mjs";
import { assertCanonicalGithubConfig } from "./github-config-lib.mjs";

const execFileAsync = promisify(execFile);
const ENVIRONMENTS_CONFIG_PATH = path.resolve("bootstrap/config/github-environments.json");
const LABELS_CONFIG_PATH = path.resolve("bootstrap/config/github-labels.json");
const RULESET_CONFIG_PATH = path.resolve("bootstrap/config/repository-rules.json");

async function gh(args, { input } = {}) {
  const result = await execFileAsync("gh", args, {
    env: process.env,
    input,
    maxBuffer: 20 * 1024 * 1024
  });
  return String(result.stdout || "").trim();
}

function isNotFoundError(error) {
  const message = [error?.message, error?.stderr, error?.stdout, error?.shortMessage]
    .filter(Boolean)
    .join("\n");
  return /HTTP 404|not found/iu.test(message);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

async function withTempJson(prefix, payload, callback) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const payloadPath = path.join(tempDir, "payload.json");
  try {
    await writeFile(payloadPath, JSON.stringify(payload), "utf8");
    return await callback(payloadPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function configureMergeSettings(repository, mergeSettings, apply) {
  const args = ["repo", "edit", repository];
  if (mergeSettings.delete_branch_on_merge) {
    args.push("--delete-branch-on-merge");
  }
  args.push(
    mergeSettings.allow_squash_merge ? "--enable-squash-merge" : "--enable-squash-merge=false"
  );
  args.push(
    mergeSettings.allow_merge_commit ? "--enable-merge-commit" : "--enable-merge-commit=false"
  );
  args.push(
    mergeSettings.allow_rebase_merge ? "--enable-rebase-merge" : "--enable-rebase-merge=false"
  );

  if (!apply) {
    console.info(`[check] gh ${args.join(" ")}`);
    return;
  }

  await gh(args);
}

async function configureRuleset(repository, ruleset, apply) {
  const existing = JSON.parse((await gh(["api", `repos/${repository}/rulesets`])) || "[]").find(
    (entry) => entry.name === ruleset.name
  );
  const endpoint = existing
    ? `repos/${repository}/rulesets/${existing.id}`
    : `repos/${repository}/rulesets`;
  const method = existing ? "PUT" : "POST";

  if (!apply) {
    console.info(`[check] ${existing ? "update" : "create"} ruleset ${ruleset.name}`);
    return;
  }

  await withTempJson("compass-gh-ruleset-", ruleset, (inputPath) =>
    gh(["api", "--method", method, endpoint, "--input", inputPath])
  );
}

async function configureLabels(repository, labels, apply) {
  const existingLabels = JSON.parse(
    (await gh(["label", "list", "--repo", repository, "--json", "name,color,description"])) || "[]"
  );
  const existingByName = new Map(existingLabels.map((entry) => [entry.name, entry]));

  for (const label of labels) {
    const current = existingByName.get(label.name);
    const desiredColor = String(label.color || "")
      .replace(/^#/, "")
      .trim();
    const desiredDescription = String(label.description || "").trim();
    const currentColor = String(current?.color || "")
      .replace(/^#/, "")
      .trim();
    const currentDescription = String(current?.description || "").trim();
    const needsUpdate =
      !current ||
      currentColor.toLowerCase() !== desiredColor.toLowerCase() ||
      currentDescription !== desiredDescription;

    if (!needsUpdate) {
      continue;
    }

    if (!apply) {
      console.info(`[check] ensure label ${label.name}`);
      continue;
    }

    await gh([
      "label",
      "create",
      label.name,
      "--repo",
      repository,
      "--color",
      desiredColor,
      "--description",
      desiredDescription,
      "--force"
    ]);
  }
}

async function configureEnvironment(repository, environmentConfig, apply) {
  const payload = {
    wait_timer: 0,
    reviewers: [],
    can_admins_bypass: Boolean(environmentConfig.canAdminsBypass),
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true
    }
  };

  if (!apply) {
    console.info(`[check] configure environment ${environmentConfig.name}`);
  } else {
    await withTempJson("compass-gh-env-", payload, (inputPath) =>
      gh([
        "api",
        "--method",
        "PUT",
        `repos/${repository}/environments/${environmentConfig.name}`,
        "--input",
        inputPath
      ])
    );
  }

  const currentPolicies = JSON.parse(
    (await gh([
      "api",
      `repos/${repository}/environments/${environmentConfig.name}/deployment-branch-policies`
    ]).catch(() => '{"branch_policies":[]}')) || '{"branch_policies":[]}'
  );
  const existingBranches = Array.isArray(currentPolicies.branch_policies)
    ? new Set(
        currentPolicies.branch_policies
          .filter((policy) => policy.type === "branch")
          .map((policy) => policy.name)
      )
    : new Set();

  for (const branchName of environmentConfig.branchPolicies || []) {
    if (existingBranches.has(branchName)) {
      continue;
    }
    if (!apply) {
      console.info(`[check] add branch policy ${environmentConfig.name}:${branchName}`);
    } else {
      await gh([
        "api",
        "--method",
        "POST",
        `repos/${repository}/environments/${environmentConfig.name}/deployment-branch-policies`,
        "-f",
        `name=${branchName}`,
        "-f",
        "type=branch"
      ]);
    }
  }
}

async function listVariables(repository, environmentName) {
  try {
    return JSON.parse(
      (await gh(
        environmentName
          ? ["variable", "list", "--repo", repository, "--env", environmentName, "--json", "name"]
          : ["variable", "list", "--repo", repository, "--json", "name"]
      )) || "[]"
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

async function listSecrets(repository, environmentName) {
  try {
    return JSON.parse(
      (await gh(
        environmentName
          ? ["secret", "list", "--repo", repository, "--env", environmentName, "--json", "name"]
          : ["secret", "list", "--repo", repository, "--json", "name"]
      )) || "[]"
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

async function clearEnvironmentScopedConfig(repository, environmentName, apply) {
  const existingVars = await listVariables(repository, environmentName);
  for (const entry of existingVars) {
    if (!apply) {
      console.info(`[check] gh variable delete ${entry.name} --env ${environmentName}`);
      continue;
    }
    await gh(["variable", "delete", entry.name, "--repo", repository, "--env", environmentName]);
  }

  const existingSecrets = await listSecrets(repository, environmentName);
  for (const entry of existingSecrets) {
    if (!apply) {
      console.info(`[check] gh secret delete ${entry.name} --env ${environmentName}`);
      continue;
    }
    await gh(["secret", "delete", entry.name, "--repo", repository, "--env", environmentName]);
  }
}

async function collectGithubConfigState(repository, environmentNames) {
  const repositoryVariables = await listVariables(repository);
  const environmentVariablesByName = {};
  const environmentSecretsByName = {};

  for (const environmentName of environmentNames) {
    environmentVariablesByName[environmentName] = await listVariables(repository, environmentName);
    environmentSecretsByName[environmentName] = await listSecrets(repository, environmentName);
  }

  return {
    repositoryVariables,
    environmentVariablesByName,
    environmentSecretsByName
  };
}

export async function configureGithubRepo({ apply = false } = {}) {
  const repository = REPOSITORY_SLUG;
  const environmentsConfig = await readJson(ENVIRONMENTS_CONFIG_PATH);
  const labelsConfig = await readJson(LABELS_CONFIG_PATH);
  const rulesetConfig = await readJson(RULESET_CONFIG_PATH);
  const environmentConfigs = environmentsConfig.environments || [];
  const configuredNames = environmentConfigs.map((entry) => entry.name);
  const environmentNames =
    configuredNames.length > 0 ? configuredNames : [...GITHUB_ENVIRONMENT_NAMES];

  await configureLabels(repository, labelsConfig.labels || [], apply);
  await configureMergeSettings(repository, rulesetConfig.merge_settings, apply);
  await configureRuleset(repository, rulesetConfig.main_ruleset, apply);

  for (const environmentName of environmentNames) {
    const environmentConfig = environmentConfigs.find((entry) => entry.name === environmentName);
    if (!environmentConfig) {
      throw new Error(`No GitHub environment config found for ${environmentName}`);
    }
    await configureEnvironment(repository, environmentConfig, apply);
    await clearEnvironmentScopedConfig(repository, environmentConfig.name, apply);
  }

  const state = await collectGithubConfigState(repository, environmentNames);
  assertCanonicalGithubConfig({
    repositoryVariables: state.repositoryVariables,
    requiredVariableNames: REQUIRED_REPO_VARIABLE_NAMES,
    environmentNames,
    environmentVariablesByName: state.environmentVariablesByName,
    environmentSecretsByName: state.environmentSecretsByName
  });
}

export async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const check = argv.includes("--check");
  if (!apply && !check) {
    throw new Error("Use --check or --apply");
  }
  await configureGithubRepo({ apply });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
