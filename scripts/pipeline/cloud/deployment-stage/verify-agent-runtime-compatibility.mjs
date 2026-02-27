import path from "node:path";
import {
  appendGithubOutput,
  getHeadSha,
  requireEnv,
  run,
  runJson,
  writeArtifact
} from "./utils.mjs";

function addCheck({ checks, reasonCodes, id, pass, details, reasonCode }) {
  checks.push({ id, pass, details });
  if (!pass && reasonCode) {
    reasonCodes.push(reasonCode);
  }
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

async function main() {
  const startedAt = Date.now();
  const headSha = getHeadSha();
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
    const bootstrapAFirstResult = await callRuntime({
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
    const bootstrapASecondResult = await callRuntime({
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
    const bootstrapBFirstResult = await callRuntime({
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
    const startTurnResult = await callRuntime({
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
    const interruptTurnResult = await callRuntime({
      url: interruptTurnUrl,
      method: "POST",
      bearerToken,
      body: {}
    });
    observed.interruptTurn = {
      status: interruptTurnResult.status,
      body: interruptTurnResult.bodyJson || interruptTurnResult.bodyText
    };

    addCheck({
      checks,
      reasonCodes,
      id: "agent-turn-interrupt-endpoint-reachable",
      pass: interruptTurnResult.ok || interruptTurnResult.status === 404,
      details: `status=${interruptTurnResult.status}`,
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
