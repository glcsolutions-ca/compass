import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export async function execGit(args) {
  const { stdout } = await execFileAsync("git", args, { encoding: "utf8" });
  return stdout.trim();
}

export async function getCurrentSha() {
  return await execGit(["rev-parse", "HEAD"]);
}

export async function getParentSha(headSha) {
  return await execGit(["rev-parse", `${headSha}^`]);
}

export async function getChangedFiles(baseSha, headSha) {
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--name-only", `${baseSha}...${headSha}`],
    {
      encoding: "utf8"
    }
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

export function matchesAnyPattern(filePath, patterns) {
  const normalizedPath = filePath.replaceAll("\\", "/");
  return patterns.some((pattern) => path.posix.matchesGlob(normalizedPath, pattern));
}

export async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function writeJsonFile(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function appendGithubOutput(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await writeFile(outputPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "a" });
}

export async function appendGithubStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  await writeFile(summaryPath, `${markdown}\n`, { encoding: "utf8", flag: "a" });
}

export async function getPrNumberFromEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return null;
  }

  const payload = await readJsonFile(eventPath);
  return payload?.pull_request?.number ?? payload?.number ?? null;
}

export function loadPipelinePolicyObject(policy) {
  assertPipelinePolicyShape(policy);
  return policy;
}

export async function loadPipelinePolicy(
  policyPath = path.join(".github", "policy", "pipeline-policy.json")
) {
  const policy = await readJsonFile(policyPath);
  return loadPipelinePolicyObject(policy);
}

export function assertPipelinePolicyShape(policy) {
  const requiredTopLevel = [
    "version",
    "scopeRules",
    "commitStage",
    "pairingPolicy",
    "highRiskMainlinePolicy",
    "automatedAcceptanceTestGate",
    "deploymentStage",
    "desktopDeploymentPipeline",
    "docsDriftRules"
  ];

  if (!policy || typeof policy !== "object") {
    throw new Error("Pipeline policy must be an object");
  }

  for (const key of requiredTopLevel) {
    if (!(key in policy)) {
      throw new Error(`Pipeline policy missing required field: ${key}`);
    }
  }

  const scopeRules = policy.scopeRules;
  const requiredScopeArrays = [
    "runtime",
    "desktop",
    "infra",
    "identity",
    "docsOnly",
    "migration",
    "infraRollout"
  ];
  for (const key of requiredScopeArrays) {
    if (!Array.isArray(scopeRules?.[key])) {
      throw new Error(`scopeRules.${key} must be an array`);
    }
  }

  const docs = policy.docsDriftRules;
  if (
    !docs ||
    !Array.isArray(docs.blockingPaths) ||
    !Array.isArray(docs.docsCriticalPaths) ||
    !Array.isArray(docs.docTargets)
  ) {
    throw new Error("docsDriftRules.blockingPaths/docsCriticalPaths/docTargets must all be arrays");
  }

  if (
    !Array.isArray(policy.commitStage?.requiredChecks) ||
    policy.commitStage.requiredChecks.length === 0
  ) {
    throw new Error("commitStage.requiredChecks must be a non-empty array");
  }

  if (!policy.commitStage?.slo || typeof policy.commitStage.slo !== "object") {
    throw new Error("commitStage.slo must be an object");
  }

  if (
    !Number.isInteger(policy.commitStage.slo.targetSeconds) ||
    policy.commitStage.slo.targetSeconds <= 0
  ) {
    throw new Error("commitStage.slo.targetSeconds must be a positive integer");
  }

  if (!["observe", "enforce"].includes(policy.commitStage.slo.mode)) {
    throw new Error("commitStage.slo.mode must be one of: observe, enforce");
  }

  const pairingPolicy = policy.pairingPolicy;
  if (!pairingPolicy || typeof pairingPolicy !== "object" || Array.isArray(pairingPolicy)) {
    throw new Error("pairingPolicy must be an object");
  }

  if (!Array.isArray(pairingPolicy.highRiskScopes) || pairingPolicy.highRiskScopes.length === 0) {
    throw new Error("pairingPolicy.highRiskScopes must be a non-empty array");
  }

  if (pairingPolicy.highRiskScopes.some((entry) => String(entry || "").trim().length === 0)) {
    throw new Error("pairingPolicy.highRiskScopes entries must be non-empty strings");
  }

  if (String(pairingPolicy.trailerKey || "").trim().length === 0) {
    throw new Error("pairingPolicy.trailerKey must be a non-empty string");
  }

  const highRiskMainlinePolicy = policy.highRiskMainlinePolicy;
  if (
    !highRiskMainlinePolicy ||
    typeof highRiskMainlinePolicy !== "object" ||
    Array.isArray(highRiskMainlinePolicy)
  ) {
    throw new Error("highRiskMainlinePolicy must be an object");
  }

  if (String(highRiskMainlinePolicy.ruleId || "").trim().length === 0) {
    throw new Error("highRiskMainlinePolicy.ruleId must be a non-empty string");
  }

  if (String(highRiskMainlinePolicy.mainBranch || "").trim().length === 0) {
    throw new Error("highRiskMainlinePolicy.mainBranch must be a non-empty string");
  }

  if (typeof highRiskMainlinePolicy.requirePullRequestOnMain !== "boolean") {
    throw new Error("highRiskMainlinePolicy.requirePullRequestOnMain must be a boolean");
  }

  if (
    !Array.isArray(highRiskMainlinePolicy.codeOwners) ||
    highRiskMainlinePolicy.codeOwners.length === 0
  ) {
    throw new Error("highRiskMainlinePolicy.codeOwners must be a non-empty array");
  }

  if (
    highRiskMainlinePolicy.codeOwners.some(
      (entry) => String(entry || "").trim().length === 0 || !String(entry).trim().startsWith("@")
    )
  ) {
    throw new Error("highRiskMainlinePolicy.codeOwners entries must be GitHub handles");
  }

  if (
    !Array.isArray(highRiskMainlinePolicy.categories) ||
    highRiskMainlinePolicy.categories.length === 0
  ) {
    throw new Error("highRiskMainlinePolicy.categories must be a non-empty array");
  }

  const seenCategoryIds = new Set();
  for (const [index, category] of highRiskMainlinePolicy.categories.entries()) {
    if (!category || typeof category !== "object" || Array.isArray(category)) {
      throw new Error(`highRiskMainlinePolicy.categories[${index}] must be an object`);
    }

    const id = String(category.id || "").trim();
    if (id.length === 0) {
      throw new Error(`highRiskMainlinePolicy.categories[${index}].id must be a non-empty string`);
    }
    if (seenCategoryIds.has(id)) {
      throw new Error(`highRiskMainlinePolicy.categories contains duplicate id: ${id}`);
    }
    seenCategoryIds.add(id);

    if (!Array.isArray(category.patterns) || category.patterns.length === 0) {
      throw new Error(
        `highRiskMainlinePolicy.categories[${index}].patterns must be a non-empty array`
      );
    }

    if (category.patterns.some((pattern) => String(pattern || "").trim().length === 0)) {
      throw new Error(
        `highRiskMainlinePolicy.categories[${index}].patterns entries must be non-empty strings`
      );
    }

    if (String(category.rationale || "").trim().length === 0) {
      throw new Error(
        `highRiskMainlinePolicy.categories[${index}].rationale must be a non-empty string`
      );
    }
  }

  const integrationGate = policy.integrationGate;
  if (integrationGate !== undefined) {
    if (!integrationGate || typeof integrationGate !== "object") {
      throw new Error("integrationGate must be an object when provided");
    }

    if (
      !Array.isArray(integrationGate.requiredChecks) ||
      integrationGate.requiredChecks.length === 0
    ) {
      throw new Error("integrationGate.requiredChecks must be a non-empty array");
    }
  }

  if (
    !Array.isArray(policy.automatedAcceptanceTestGate?.runtimeRequiredChecks) ||
    !Array.isArray(policy.automatedAcceptanceTestGate?.infraRequiredChecks) ||
    !Array.isArray(policy.automatedAcceptanceTestGate?.identityRequiredChecks) ||
    !Array.isArray(policy.automatedAcceptanceTestGate?.requiredFlowIds)
  ) {
    throw new Error(
      "automatedAcceptanceTestGate.requiredFlowIds/runtimeRequiredChecks/infraRequiredChecks/identityRequiredChecks must be arrays"
    );
  }

  if (typeof policy.deploymentStage?.requireFreshHeadOnAuto !== "boolean") {
    throw new Error("deploymentStage.requireFreshHeadOnAuto must be a boolean");
  }

  const cloudDeploymentPipelineSlo = policy.cloudDeploymentPipeline?.slo;
  if (cloudDeploymentPipelineSlo !== undefined) {
    if (!cloudDeploymentPipelineSlo || typeof cloudDeploymentPipelineSlo !== "object") {
      throw new Error("cloudDeploymentPipeline.slo must be an object when provided");
    }

    if (!["observe", "enforce"].includes(String(cloudDeploymentPipelineSlo.mode || "").trim())) {
      throw new Error("cloudDeploymentPipeline.slo.mode must be one of: observe, enforce");
    }

    const acceptanceTarget = cloudDeploymentPipelineSlo.automatedAcceptanceTestGateTargetSeconds;
    const productionTarget = cloudDeploymentPipelineSlo.deploymentStageTargetSeconds;
    if (!Number.isInteger(acceptanceTarget) || acceptanceTarget <= 0) {
      throw new Error(
        "cloudDeploymentPipeline.slo.automatedAcceptanceTestGateTargetSeconds must be a positive integer"
      );
    }
    if (!Number.isInteger(productionTarget) || productionTarget <= 0) {
      throw new Error(
        "cloudDeploymentPipeline.slo.deploymentStageTargetSeconds must be a positive integer"
      );
    }
  }

  const desktopDeploymentPipeline = policy.desktopDeploymentPipeline;
  if (desktopDeploymentPipeline !== undefined) {
    if (!desktopDeploymentPipeline || typeof desktopDeploymentPipeline !== "object") {
      throw new Error("desktopDeploymentPipeline must be an object when provided");
    }

    if (
      !Array.isArray(desktopDeploymentPipeline.requiredChecks) ||
      desktopDeploymentPipeline.requiredChecks.length === 0
    ) {
      throw new Error("desktopDeploymentPipeline.requiredChecks must be a non-empty array");
    }

    if (
      !desktopDeploymentPipeline.artifactContracts ||
      typeof desktopDeploymentPipeline.artifactContracts !== "object"
    ) {
      throw new Error("desktopDeploymentPipeline.artifactContracts must be an object");
    }

    const artifactContractKeys = [
      "releaseCandidateManifestPath",
      "automatedAcceptanceTestGateResultPath",
      "deploymentResultPath",
      "releaseDecisionPath"
    ];
    for (const key of artifactContractKeys) {
      const value = String(desktopDeploymentPipeline.artifactContracts[key] || "").trim();
      if (value.length === 0) {
        throw new Error(
          `desktopDeploymentPipeline.artifactContracts.${key} must be a non-empty string`
        );
      }
    }

    const desktopDeploymentPipelineSlo = desktopDeploymentPipeline.slo;
    if (!desktopDeploymentPipelineSlo || typeof desktopDeploymentPipelineSlo !== "object") {
      throw new Error("desktopDeploymentPipeline.slo must be an object");
    }

    if (!["observe", "enforce"].includes(String(desktopDeploymentPipelineSlo.mode || "").trim())) {
      throw new Error("desktopDeploymentPipeline.slo.mode must be one of: observe, enforce");
    }

    if (
      !Number.isInteger(desktopDeploymentPipelineSlo.automatedAcceptanceTestGateTargetSeconds) ||
      desktopDeploymentPipelineSlo.automatedAcceptanceTestGateTargetSeconds <= 0
    ) {
      throw new Error(
        "desktopDeploymentPipeline.slo.automatedAcceptanceTestGateTargetSeconds must be a positive integer"
      );
    }

    if (
      !Number.isInteger(desktopDeploymentPipelineSlo.deploymentStageTargetSeconds) ||
      desktopDeploymentPipelineSlo.deploymentStageTargetSeconds <= 0
    ) {
      throw new Error(
        "desktopDeploymentPipeline.slo.deploymentStageTargetSeconds must be a positive integer"
      );
    }
  }
}

export function resolveChangeScope(policy, changedFiles) {
  const docsOnlyEligible =
    changedFiles.length > 0 &&
    changedFiles.every((filePath) => matchesAnyPattern(filePath, policy.scopeRules.docsOnly));

  // Scope booleans represent mutable system surfaces, so documentation-only files
  // are excluded before runtime/desktop/infra/identity classification.
  const nonDocsChangedFiles = changedFiles.filter(
    (filePath) => !matchesAnyPattern(filePath, policy.scopeRules.docsOnly)
  );

  const runtime = nonDocsChangedFiles.some((filePath) =>
    matchesAnyPattern(filePath, policy.scopeRules.runtime)
  );
  const desktop = nonDocsChangedFiles.some((filePath) =>
    matchesAnyPattern(filePath, policy.scopeRules.desktop)
  );
  const infra = nonDocsChangedFiles.some((filePath) =>
    matchesAnyPattern(filePath, policy.scopeRules.infra)
  );
  const identity = nonDocsChangedFiles.some((filePath) =>
    matchesAnyPattern(filePath, policy.scopeRules.identity)
  );
  const migration = nonDocsChangedFiles.some((filePath) =>
    matchesAnyPattern(filePath, policy.scopeRules.migration)
  );
  const infraRollout = nonDocsChangedFiles.some((filePath) =>
    matchesAnyPattern(filePath, policy.scopeRules.infraRollout)
  );
  const docsOnly = docsOnlyEligible;

  return {
    runtime,
    desktop,
    infra,
    identity,
    migration,
    infraRollout,
    docsOnly
  };
}

export function classifyReleaseCandidateKind(scope) {
  if (scope.runtime) {
    return "runtime";
  }

  if (scope.infra) {
    return "infra";
  }

  if (scope.identity) {
    return "identity";
  }

  if (scope.desktop) {
    return "desktop";
  }

  return "checks";
}

export function evaluateDocsDrift(policy, changedFiles) {
  const blockingPathsChanged = changedFiles.filter((filePath) =>
    matchesAnyPattern(filePath, policy.docsDriftRules.blockingPaths)
  );

  const docsCriticalPathsChanged = changedFiles.filter((filePath) =>
    matchesAnyPattern(filePath, policy.docsDriftRules.docsCriticalPaths)
  );

  const touchedDocTargets = changedFiles.filter((filePath) =>
    matchesAnyPattern(filePath, policy.docsDriftRules.docTargets)
  );

  const expectedDocTargets = [...policy.docsDriftRules.docTargets];
  const touchesBlockingPaths = blockingPathsChanged.length > 0;
  const touchesDocsCriticalPaths = docsCriticalPathsChanged.length > 0;

  const docsUpdated = touchedDocTargets.length > 0;
  const shouldBlock = touchesDocsCriticalPaths && !docsUpdated;
  const reasonCodes = [];

  if (shouldBlock) {
    reasonCodes.push("DOCS_DRIFT_BLOCKING_DOC_TARGET_MISSING");
  } else if (touchesBlockingPaths && !docsUpdated) {
    reasonCodes.push("DOCS_DRIFT_ADVISORY_DOC_TARGET_MISSING");
  }

  return {
    touchesBlockingPaths,
    touchesDocsCriticalPaths,
    blockingPathsChanged,
    docsCriticalPathsChanged,
    docsUpdated,
    touchedDocTargets,
    expectedDocTargets,
    reasonCodes,
    shouldBlock
  };
}

export function parseJsonEnv(name, fallback = null) {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  return JSON.parse(raw);
}

export function parsePossiblyFencedJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) {
    return JSON.parse(trimmed);
  }

  const withoutFenceStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  const withoutFenceEnd = withoutFenceStart.replace(/\s*```\s*$/i, "");
  return JSON.parse(withoutFenceEnd);
}
