import path from "node:path";
import {
  appendGithubOutput,
  getHeadSha,
  requireEnv,
  run,
  runJson,
  sleep,
  writeArtifact
} from "./utils.mjs";

const SESSION_EXECUTOR_ROLE_DEFINITION_GUID = "0fb8eba5-a2bb-4abe-b1c1-49dfad359bb0";
const AUTHORIZATION_RETRY_ATTEMPTS = 6;
const AUTHORIZATION_RETRY_DELAY_MS = 5_000;
const RUNTIME_CALL_RETRY_ATTEMPTS = 24;
const RUNTIME_CALL_RETRY_DELAY_MS = 5_000;

function addCheck({ checks, reasonCodes, id, pass, details, reasonCode }) {
  checks.push({ id, pass, details });
  if (!pass && reasonCode) {
    reasonCodes.push(reasonCode);
  }
}

function decodeJwtPayload(accessToken) {
  const segments = String(accessToken || "").split(".");
  if (segments.length < 2) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function normalizeRoleDefinitionId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function resolveCurrentPrincipalObjectId() {
  const managementToken = await runJson("az", [
    "account",
    "get-access-token",
    "--resource",
    "https://management.azure.com",
    "--output",
    "json"
  ]);

  const accessToken = String(managementToken?.accessToken || "").trim();
  const claims = decodeJwtPayload(accessToken);
  return String(claims.oid || claims.object_id || "").trim();
}

async function listRoleAssignmentsAtPoolScope({ sessionPoolId, principalId }) {
  const assignments = await runJson("az", [
    "role",
    "assignment",
    "list",
    "--scope",
    sessionPoolId,
    "--assignee-object-id",
    principalId,
    "--output",
    "json"
  ]);

  return Array.isArray(assignments) ? assignments : [];
}

function getMatchingRoleAssignments(assignments, expectedRoleDefinitionId) {
  const normalizedExpected = normalizeRoleDefinitionId(expectedRoleDefinitionId);
  return assignments.filter((assignment) => {
    const candidate = normalizeRoleDefinitionId(assignment?.roleDefinitionId);
    return candidate === normalizedExpected;
  });
}

async function ensureVerifierHasSessionExecutorRole({
  subscriptionId,
  sessionPoolId,
  principalId
}) {
  const roleDefinitionId = `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${SESSION_EXECUTOR_ROLE_DEFINITION_GUID}`;
  let created = false;

  let assignments = await listRoleAssignmentsAtPoolScope({
    sessionPoolId,
    principalId
  });
  let matching = getMatchingRoleAssignments(assignments, roleDefinitionId);

  if (matching.length === 0) {
    try {
      await run("az", [
        "role",
        "assignment",
        "create",
        "--scope",
        sessionPoolId,
        "--assignee-object-id",
        principalId,
        "--assignee-principal-type",
        "ServicePrincipal",
        "--role",
        roleDefinitionId,
        "--output",
        "none"
      ]);
      created = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists/i.test(message)) {
        throw error;
      }
    }
  }

  for (let attempt = 1; attempt <= AUTHORIZATION_RETRY_ATTEMPTS; attempt += 1) {
    assignments = await listRoleAssignmentsAtPoolScope({
      sessionPoolId,
      principalId
    });
    matching = getMatchingRoleAssignments(assignments, roleDefinitionId);
    if (matching.length > 0) {
      return {
        roleDefinitionId,
        roleAssignmentCreated: created,
        roleAssignmentCount: matching.length
      };
    }

    if (attempt < AUTHORIZATION_RETRY_ATTEMPTS) {
      await sleep(AUTHORIZATION_RETRY_DELAY_MS);
    }
  }

  return {
    roleDefinitionId,
    roleAssignmentCreated: created,
    roleAssignmentCount: 0
  };
}

async function callRuntime(input) {
  const response = await fetch(input.url, {
    method: input.method,
    headers: {
      authorization: `Bearer ${input.bearerToken}`,
      "content-type": "application/json"
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    bodyText: text,
    bodyJson: json
  };
}

async function callRuntimeWithAuthorizationRetry(input) {
  let result = null;
  for (let attempt = 1; attempt <= RUNTIME_CALL_RETRY_ATTEMPTS; attempt += 1) {
    result = await callRuntime(input);
    if (
      result.status !== 401 &&
      result.status !== 403 &&
      result.status !== 429 &&
      result.status !== 500 &&
      result.status !== 502 &&
      result.status !== 503 &&
      result.status !== 504
    ) {
      break;
    }

    if (attempt < RUNTIME_CALL_RETRY_ATTEMPTS) {
      await sleep(RUNTIME_CALL_RETRY_DELAY_MS);
    }
  }

  return result;
}

async function main() {
  const startedAt = Date.now();
  const headSha = getHeadSha();
  const subscriptionId = requireEnv("AZURE_SUBSCRIPTION_ID");
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const sessionPoolName = requireEnv("DYNAMIC_SESSIONS_POOL_NAME");

  const checks = [];
  const reasonCodes = [];
  let runtimeError = "";
  const observed = {
    poolManagementEndpoint: "",
    bootstrapIdentifierAFirst: null,
    bootstrapIdentifierASecond: null,
    bootstrapIdentifierBFirst: null,
    startTurn: null,
    interruptTurn: null,
    isolation: {
      sessionStickiness: null,
      sessionIsolation: null,
      runtimeThreadStickiness: null,
      runtimeThreadIsolation: null
    },
    authorization: {
      verifierPrincipalId: "",
      roleDefinitionId: "",
      roleAssignmentCreated: false,
      roleAssignmentCount: 0
    }
  };

  try {
    const sessionPool = await runJson("az", [
      "resource",
      "show",
      "--resource-group",
      resourceGroup,
      "--resource-type",
      "Microsoft.App/sessionPools",
      "--name",
      sessionPoolName,
      "--api-version",
      "2025-07-01",
      "--output",
      "json"
    ]);

    const poolManagementEndpoint = String(
      sessionPool?.properties?.poolManagementEndpoint || ""
    ).trim();
    observed.poolManagementEndpoint = poolManagementEndpoint;

    addCheck({
      checks,
      reasonCodes,
      id: "pool-management-endpoint-present",
      pass: poolManagementEndpoint.startsWith("https://"),
      details: `poolManagementEndpoint=${poolManagementEndpoint || "(empty)"}`,
      reasonCode: "AGENT_RUNTIME_POOL_ENDPOINT_INVALID"
    });

    if (!poolManagementEndpoint.startsWith("https://")) {
      throw new Error("Dynamic Sessions pool management endpoint is missing or invalid");
    }

    const verifierPrincipalId = await resolveCurrentPrincipalObjectId();
    observed.authorization.verifierPrincipalId = verifierPrincipalId || "(unresolved)";
    if (!verifierPrincipalId) {
      throw new Error("Unable to resolve deployment principal object ID");
    }

    const verifierAuthorization = await ensureVerifierHasSessionExecutorRole({
      subscriptionId,
      sessionPoolId: String(sessionPool?.id || ""),
      principalId: verifierPrincipalId
    });
    observed.authorization = {
      verifierPrincipalId,
      roleDefinitionId: verifierAuthorization.roleDefinitionId,
      roleAssignmentCreated: verifierAuthorization.roleAssignmentCreated,
      roleAssignmentCount: verifierAuthorization.roleAssignmentCount
    };

    addCheck({
      checks,
      reasonCodes,
      id: "verifier-principal-has-session-executor-role",
      pass: verifierAuthorization.roleAssignmentCount > 0,
      details: `principalId=${verifierPrincipalId}, roleAssignmentCount=${verifierAuthorization.roleAssignmentCount}`,
      reasonCode: "AGENT_RUNTIME_VERIFIER_AUTHORIZATION_FAILED"
    });

    const tokenResult = await run("az", [
      "account",
      "get-access-token",
      "--resource",
      "https://dynamicsessions.io",
      "--query",
      "accessToken",
      "--output",
      "tsv"
    ]);

    const bearerToken = tokenResult.stdout.trim();
    if (!bearerToken) {
      throw new Error("Unable to mint Dynamic Sessions audience token");
    }

    const baseUrl = poolManagementEndpoint.endsWith("/")
      ? poolManagementEndpoint
      : `${poolManagementEndpoint}/`;

    const identifierA = `compat-a-${headSha.slice(0, 8)}-${Date.now().toString(36)}`;
    const identifierB = `compat-b-${headSha.slice(0, 8)}-${Date.now().toString(36)}`;
    const turnId = `turn-${Date.now().toString(36)}`;

    const bootstrapAFirstUrl = new URL(
      `agent/session/bootstrap?identifier=${encodeURIComponent(identifierA)}`,
      baseUrl
    ).toString();
    const bootstrapAFirstResult = await callRuntimeWithAuthorizationRetry({
      url: bootstrapAFirstUrl,
      method: "POST",
      bearerToken,
      body: { reason: "pipeline-compatibility-check" }
    });

    observed.bootstrapIdentifierAFirst = {
      status: bootstrapAFirstResult.status,
      body: bootstrapAFirstResult.bodyJson || bootstrapAFirstResult.bodyText
    };

    addCheck({
      checks,
      reasonCodes,
      id: "agent-session-bootstrap-accepted",
      pass: bootstrapAFirstResult.ok,
      details: `status=${bootstrapAFirstResult.status}`,
      reasonCode: "AGENT_RUNTIME_BOOTSTRAP_FAILED"
    });

    const bootstrapASecondUrl = new URL(
      `agent/session/bootstrap?identifier=${encodeURIComponent(identifierA)}`,
      baseUrl
    ).toString();
    const bootstrapASecondResult = await callRuntimeWithAuthorizationRetry({
      url: bootstrapASecondUrl,
      method: "POST",
      bearerToken,
      body: { reason: "pipeline-compatibility-check-repeat" }
    });
    observed.bootstrapIdentifierASecond = {
      status: bootstrapASecondResult.status,
      body: bootstrapASecondResult.bodyJson || bootstrapASecondResult.bodyText
    };

    const bootstrapBFirstUrl = new URL(
      `agent/session/bootstrap?identifier=${encodeURIComponent(identifierB)}`,
      baseUrl
    ).toString();
    const bootstrapBFirstResult = await callRuntimeWithAuthorizationRetry({
      url: bootstrapBFirstUrl,
      method: "POST",
      bearerToken,
      body: { reason: "pipeline-compatibility-check-isolation" }
    });
    observed.bootstrapIdentifierBFirst = {
      status: bootstrapBFirstResult.status,
      body: bootstrapBFirstResult.bodyJson || bootstrapBFirstResult.bodyText
    };

    const sessionAFirst = String(bootstrapAFirstResult.bodyJson?.session?.sessionId || "").trim();
    const sessionASecond = String(bootstrapASecondResult.bodyJson?.session?.sessionId || "").trim();
    const sessionBFirst = String(bootstrapBFirstResult.bodyJson?.session?.sessionId || "").trim();
    const runtimeThreadAFirst = String(
      bootstrapAFirstResult.bodyJson?.session?.codexThreadId || ""
    ).trim();
    const runtimeThreadASecond = String(
      bootstrapASecondResult.bodyJson?.session?.codexThreadId || ""
    ).trim();
    const runtimeThreadBFirst = String(
      bootstrapBFirstResult.bodyJson?.session?.codexThreadId || ""
    ).trim();

    const sessionStickiness = Boolean(sessionAFirst) && sessionAFirst === sessionASecond;
    const sessionIsolation =
      Boolean(sessionAFirst) && Boolean(sessionBFirst) && sessionAFirst !== sessionBFirst;
    const runtimeThreadStickiness =
      Boolean(runtimeThreadAFirst) && runtimeThreadAFirst === runtimeThreadASecond;
    const runtimeThreadIsolation =
      Boolean(runtimeThreadAFirst) &&
      Boolean(runtimeThreadBFirst) &&
      runtimeThreadAFirst !== runtimeThreadBFirst;

    observed.isolation = {
      sessionStickiness: {
        pass: sessionStickiness,
        sessionAFirst,
        sessionASecond
      },
      sessionIsolation: {
        pass: sessionIsolation,
        sessionAFirst,
        sessionBFirst
      },
      runtimeThreadStickiness: {
        pass: runtimeThreadStickiness,
        runtimeThreadAFirst,
        runtimeThreadASecond
      },
      runtimeThreadIsolation: {
        pass: runtimeThreadIsolation,
        runtimeThreadAFirst,
        runtimeThreadBFirst
      }
    };

    addCheck({
      checks,
      reasonCodes,
      id: "identifier-session-stickiness",
      pass: sessionStickiness,
      details: `sessionAFirst=${sessionAFirst || "(empty)"}, sessionASecond=${sessionASecond || "(empty)"}`,
      reasonCode: "AGENT_RUNTIME_IDENTIFIER_STICKINESS_FAILED"
    });

    addCheck({
      checks,
      reasonCodes,
      id: "cross-identifier-session-isolation",
      pass: sessionIsolation,
      details: `sessionAFirst=${sessionAFirst || "(empty)"}, sessionBFirst=${sessionBFirst || "(empty)"}`,
      reasonCode: "AGENT_RUNTIME_IDENTIFIER_ISOLATION_FAILED"
    });

    addCheck({
      checks,
      reasonCodes,
      id: "identifier-runtime-thread-stickiness",
      pass: runtimeThreadStickiness,
      details: `runtimeThreadAFirst=${runtimeThreadAFirst || "(empty)"}, runtimeThreadASecond=${runtimeThreadASecond || "(empty)"}`,
      reasonCode: "AGENT_RUNTIME_THREAD_STICKINESS_FAILED"
    });

    addCheck({
      checks,
      reasonCodes,
      id: "cross-identifier-runtime-thread-isolation",
      pass: runtimeThreadIsolation,
      details: `runtimeThreadAFirst=${runtimeThreadAFirst || "(empty)"}, runtimeThreadBFirst=${runtimeThreadBFirst || "(empty)"}`,
      reasonCode: "AGENT_RUNTIME_THREAD_ISOLATION_FAILED"
    });

    const startTurnUrl = new URL(
      `agent/turns/start?identifier=${encodeURIComponent(identifierA)}`,
      baseUrl
    ).toString();
    const startTurnResult = await callRuntimeWithAuthorizationRetry({
      url: startTurnUrl,
      method: "POST",
      bearerToken,
      body: {
        threadId: identifierA,
        turnId,
        text: "compatibility probe"
      }
    });
    observed.startTurn = {
      status: startTurnResult.status,
      body: startTurnResult.bodyJson || startTurnResult.bodyText
    };

    const outputText = String(startTurnResult.bodyJson?.outputText || "").trim();
    addCheck({
      checks,
      reasonCodes,
      id: "agent-turn-start-accepted",
      pass: startTurnResult.ok,
      details: `status=${startTurnResult.status}`,
      reasonCode: "AGENT_RUNTIME_TURN_START_FAILED"
    });

    addCheck({
      checks,
      reasonCodes,
      id: "agent-turn-start-returns-output",
      pass: outputText.length > 0,
      details: `outputTextLength=${outputText.length}`,
      reasonCode: "AGENT_RUNTIME_TURN_OUTPUT_MISSING"
    });

    const interruptTurnUrl = new URL(
      `agent/turns/${encodeURIComponent(turnId)}/interrupt?identifier=${encodeURIComponent(identifierA)}`,
      baseUrl
    ).toString();
    const interruptTurnResult = await callRuntimeWithAuthorizationRetry({
      url: interruptTurnUrl,
      method: "POST",
      bearerToken,
      body: {}
    });
    observed.interruptTurn = {
      status: interruptTurnResult.status,
      body: interruptTurnResult.bodyJson || interruptTurnResult.bodyText
    };

    const interruptErrorCode = String(interruptTurnResult.bodyJson?.code || "").trim();
    const interruptErrorMessage = String(interruptTurnResult.bodyJson?.message || "")
      .trim()
      .toLowerCase();
    const interruptTerminalState =
      interruptTurnResult.status === 404 ||
      (interruptTurnResult.status === 502 &&
        interruptErrorCode === "RUNTIME_INTERRUPT_FAILED" &&
        /thread not found|turn not found|already completed|not in progress/u.test(
          interruptErrorMessage
        ));

    addCheck({
      checks,
      reasonCodes,
      id: "agent-turn-interrupt-endpoint-reachable",
      pass: interruptTurnResult.ok || interruptTerminalState,
      details: `status=${interruptTurnResult.status}, code=${interruptErrorCode || "(none)"}`,
      reasonCode: "AGENT_RUNTIME_INTERRUPT_FAILED"
    });
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : String(error);
    reasonCodes.push("AGENT_RUNTIME_COMPATIBILITY_RUNTIME_ERROR");
  }

  const failedChecks = checks.filter((check) => !check.pass);
  const status = runtimeError.length === 0 && failedChecks.length === 0 ? "pass" : "fail";
  const artifactPath = path.join(
    ".artifacts",
    "infra",
    headSha,
    "agent-runtime-compatibility.json"
  );

  await writeArtifact(artifactPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    status,
    reasonCodes,
    runtimeError,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    observed,
    checks
  });

  await appendGithubOutput({
    agent_runtime_compatibility_path: artifactPath,
    agent_runtime_compatibility_status: status
  });

  if (status !== "pass") {
    throw new Error(
      `Agent runtime compatibility verification failed (${reasonCodes.join(", ") || "UNKNOWN"})`
    );
  }
}

void main();
