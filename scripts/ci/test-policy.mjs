import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_TEST_POLICY_PATH = path.join("tests", "policy", "test-policy.json");

export const REQUIRED_TEST_RULE_IDS = ["TC001", "TC010", "TC011", "TC020"];
export const REQUIRED_TEST_LAYER_KEYS = ["commitStage", "integration", "e2e", "smoke"];
export const REQUIRED_TEST_DOC_KEYS = [
  "principles",
  "directoryConventions",
  "flakePolicy",
  "integrationLayer"
];
export const REQUIRED_RUNTIME_MODES = ["commitStage", "integration"];

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }

  return value.trim();
}

function assertBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
}

function assertStringArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`);
  }

  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string" || value[index].trim().length === 0) {
      throw new Error(`${name}[${index}] must be a non-empty string`);
    }
  }
}

function assertPortArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }

  for (let index = 0; index < value.length; index += 1) {
    const port = value[index];
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`${name}[${index}] must be a valid port number`);
    }
  }
}

function assertRequiredField(objectValue, key, objectName) {
  if (!(key in objectValue)) {
    throw new Error(`${objectName} missing required field: ${key}`);
  }
}

function assertDocLink(value, name) {
  const link = assertString(value, name);
  if (!link.startsWith("tests/README.md#")) {
    throw new Error(`${name} must reference tests/README.md#...`);
  }
}

function assertRuntimeModeShape(modeConfig, modeKey) {
  const modeName = `test policy runtime.modes.${modeKey}`;
  assertObject(modeConfig, modeName);

  assertBoolean(modeConfig.allowLoopbackOnly, `${modeName}.allowLoopbackOnly`);
  assertBoolean(modeConfig.allowPostgres, `${modeName}.allowPostgres`);
  assertBoolean(modeConfig.blockChildProcess, `${modeName}.blockChildProcess`);
  assertPortArray(modeConfig.blockedPorts, `${modeName}.blockedPorts`);
}

export function assertTestingPolicyShape(policy) {
  assertObject(policy, "Test policy");

  const requiredTopLevel = [
    "schemaVersion",
    "scanRoots",
    "layers",
    "imports",
    "paths",
    "docs",
    "rules",
    "runtime",
    "lint"
  ];

  for (const key of requiredTopLevel) {
    assertRequiredField(policy, key, "test policy");
  }

  if (policy.schemaVersion !== "2") {
    throw new Error('test policy schemaVersion must be "2"');
  }

  assertStringArray(policy.scanRoots, "test policy scanRoots");

  assertObject(policy.layers, "test policy layers");
  for (const layerKey of REQUIRED_TEST_LAYER_KEYS) {
    assertStringArray(policy.layers[layerKey], `test policy layers.${layerKey}`);
  }

  assertObject(policy.imports, "test policy imports");
  assertStringArray(policy.imports.playwrightModules, "test policy imports.playwrightModules");
  assertStringArray(policy.imports.dbModules, "test policy imports.dbModules");

  assertObject(policy.paths, "test policy paths");
  assertString(policy.paths.quarantine, "test policy paths.quarantine");

  assertObject(policy.docs, "test policy docs");
  for (const docKey of REQUIRED_TEST_DOC_KEYS) {
    assertDocLink(policy.docs[docKey], `test policy docs.${docKey}`);
  }

  assertObject(policy.rules, "test policy rules");
  for (const ruleId of REQUIRED_TEST_RULE_IDS) {
    assertObject(policy.rules[ruleId], `test policy rules.${ruleId}`);
    assertBoolean(policy.rules[ruleId].enabled, `test policy rules.${ruleId}.enabled`);
  }

  assertObject(policy.runtime, "test policy runtime");
  assertObject(policy.runtime.modes, "test policy runtime.modes");
  for (const mode of REQUIRED_RUNTIME_MODES) {
    assertRuntimeModeShape(policy.runtime.modes[mode], mode);
  }

  assertObject(policy.lint, "test policy lint");
  assertStringArray(policy.lint.commitStageGlobs, "test policy lint.commitStageGlobs");
  assertBoolean(policy.lint.focusedTests, "test policy lint.focusedTests");
  assertBoolean(policy.lint.disallowMathRandom, "test policy lint.disallowMathRandom");
  assertBoolean(policy.lint.disallowRawSetTimeout, "test policy lint.disallowRawSetTimeout");
  assertBoolean(policy.lint.disallowDbImports, "test policy lint.disallowDbImports");
  assertBoolean(
    policy.lint.disallowChildProcessImports,
    "test policy lint.disallowChildProcessImports"
  );
  assertStringArray(policy.lint.dbModules, "test policy lint.dbModules");
}

export function loadTestPolicyObject(policy) {
  assertTestingPolicyShape(policy);
  return policy;
}

export async function loadTestPolicy(policyPath = DEFAULT_TEST_POLICY_PATH) {
  let raw;
  try {
    raw = await readFile(policyPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read test policy at ${policyPath}: ${message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Test policy at ${policyPath} must be valid JSON: ${message}`);
  }

  return loadTestPolicyObject(parsed);
}

export function loadTestPolicySync(policyPath = DEFAULT_TEST_POLICY_PATH) {
  let raw;
  try {
    raw = readFileSync(policyPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read test policy at ${policyPath}: ${message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Test policy at ${policyPath} must be valid JSON: ${message}`);
  }

  return loadTestPolicyObject(parsed);
}
