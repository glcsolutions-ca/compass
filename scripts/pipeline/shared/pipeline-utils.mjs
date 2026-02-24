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
    "acceptanceStage",
    "productionStage",
    "desktopPipeline",
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

  const mergeQueueGate = policy.mergeQueueGate;
  if (mergeQueueGate !== undefined) {
    if (!mergeQueueGate || typeof mergeQueueGate !== "object") {
      throw new Error("mergeQueueGate must be an object when provided");
    }

    if (
      !Array.isArray(mergeQueueGate.requiredChecks) ||
      mergeQueueGate.requiredChecks.length === 0
    ) {
      throw new Error("mergeQueueGate.requiredChecks must be a non-empty array");
    }
  }

  if (
    !Array.isArray(policy.acceptanceStage?.runtimeRequiredChecks) ||
    !Array.isArray(policy.acceptanceStage?.infraRequiredChecks) ||
    !Array.isArray(policy.acceptanceStage?.identityRequiredChecks) ||
    !Array.isArray(policy.acceptanceStage?.requiredFlowIds)
  ) {
    throw new Error(
      "acceptanceStage.requiredFlowIds/runtimeRequiredChecks/infraRequiredChecks/identityRequiredChecks must be arrays"
    );
  }

  if (typeof policy.productionStage?.requireFreshHeadOnAuto !== "boolean") {
    throw new Error("productionStage.requireFreshHeadOnAuto must be a boolean");
  }

  const cloudDeliveryPipelineSlo = policy.cloudDeliveryPipeline?.slo;
  if (cloudDeliveryPipelineSlo !== undefined) {
    if (!cloudDeliveryPipelineSlo || typeof cloudDeliveryPipelineSlo !== "object") {
      throw new Error("cloudDeliveryPipeline.slo must be an object when provided");
    }

    if (!["observe", "enforce"].includes(String(cloudDeliveryPipelineSlo.mode || "").trim())) {
      throw new Error("cloudDeliveryPipeline.slo.mode must be one of: observe, enforce");
    }

    const acceptanceTarget = cloudDeliveryPipelineSlo.acceptanceTargetSeconds;
    const productionTarget = cloudDeliveryPipelineSlo.productionTargetSeconds;
    if (!Number.isInteger(acceptanceTarget) || acceptanceTarget <= 0) {
      throw new Error(
        "cloudDeliveryPipeline.slo.acceptanceTargetSeconds must be a positive integer"
      );
    }
    if (!Number.isInteger(productionTarget) || productionTarget <= 0) {
      throw new Error(
        "cloudDeliveryPipeline.slo.productionTargetSeconds must be a positive integer"
      );
    }
  }

  const desktopPipeline = policy.desktopPipeline;
  if (desktopPipeline !== undefined) {
    if (!desktopPipeline || typeof desktopPipeline !== "object") {
      throw new Error("desktopPipeline must be an object when provided");
    }

    if (
      !Array.isArray(desktopPipeline.requiredChecks) ||
      desktopPipeline.requiredChecks.length === 0
    ) {
      throw new Error("desktopPipeline.requiredChecks must be a non-empty array");
    }

    if (
      !desktopPipeline.artifactContracts ||
      typeof desktopPipeline.artifactContracts !== "object"
    ) {
      throw new Error("desktopPipeline.artifactContracts must be an object");
    }

    const artifactContractKeys = [
      "candidateManifestPath",
      "acceptanceResultPath",
      "productionResultPath",
      "releaseDecisionPath"
    ];
    for (const key of artifactContractKeys) {
      const value = String(desktopPipeline.artifactContracts[key] || "").trim();
      if (value.length === 0) {
        throw new Error(`desktopPipeline.artifactContracts.${key} must be a non-empty string`);
      }
    }

    const desktopPipelineSlo = desktopPipeline.slo;
    if (!desktopPipelineSlo || typeof desktopPipelineSlo !== "object") {
      throw new Error("desktopPipeline.slo must be an object");
    }

    if (!["observe", "enforce"].includes(String(desktopPipelineSlo.mode || "").trim())) {
      throw new Error("desktopPipeline.slo.mode must be one of: observe, enforce");
    }

    if (
      !Number.isInteger(desktopPipelineSlo.acceptanceTargetSeconds) ||
      desktopPipelineSlo.acceptanceTargetSeconds <= 0
    ) {
      throw new Error("desktopPipeline.slo.acceptanceTargetSeconds must be a positive integer");
    }

    if (
      !Number.isInteger(desktopPipelineSlo.productionTargetSeconds) ||
      desktopPipelineSlo.productionTargetSeconds <= 0
    ) {
      throw new Error("desktopPipeline.slo.productionTargetSeconds must be a positive integer");
    }
  }
}

export function resolveChangeScope(policy, changedFiles) {
  const docsOnlyCandidate =
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
  const docsOnly = docsOnlyCandidate;

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

export function classifyCandidateKind(scope) {
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
