import path from "node:path";
import {
  appendGithubOutput,
  getHeadSha,
  requireEnv,
  runJson,
  sleep,
  writeArtifact
} from "./utils.mjs";
import { withCcsGuardrail } from "../../shared/ccs-contract.mjs";

const SESSION_EXECUTOR_ROLE_DEFINITION_GUID = "0fb8eba5-a2bb-4abe-b1c1-49dfad359bb0";
const EXPECTED_NETWORK_STATUS = "EgressEnabled";
const ROLE_ASSIGNMENT_WAIT_TIMEOUT_MS = 120000;
const ROLE_ASSIGNMENT_POLL_INTERVAL_MS = 5000;

function readProvisioningState(sessionPool) {
  const stateCandidates = [
    sessionPool?.properties?.provisioningState,
    sessionPool?.properties?.status?.provisioningState,
    sessionPool?.properties?.status
  ];

  for (const candidate of stateCandidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function normalizeRoleDefinitionId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePrincipalId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hasExpectedRoleAssignment(assignments, expectedRoleDefinitionId) {
  const expected = normalizeRoleDefinitionId(expectedRoleDefinitionId);
  return assignments.some(
    (assignment) => normalizeRoleDefinitionId(assignment?.roleDefinitionId) === expected
  );
}

async function waitForExpectedRoleAssignment({
  assigneeObjectId,
  scope,
  expectedRoleDefinitionId
}) {
  const startedAt = Date.now();
  let attempts = 0;
  let latestAssignments = [];
  const normalizedAssigneeObjectId = normalizePrincipalId(assigneeObjectId);

  while (Date.now() - startedAt <= ROLE_ASSIGNMENT_WAIT_TIMEOUT_MS) {
    attempts += 1;
    const scopeAssignments =
      (await runJson("az", ["role", "assignment", "list", "--scope", scope, "--output", "json"])) ||
      [];

    latestAssignments = scopeAssignments.filter(
      (assignment) => normalizePrincipalId(assignment?.principalId) === normalizedAssigneeObjectId
    );

    if (hasExpectedRoleAssignment(latestAssignments, expectedRoleDefinitionId)) {
      return {
        found: true,
        attempts,
        assignments: latestAssignments
      };
    }

    await sleep(ROLE_ASSIGNMENT_POLL_INTERVAL_MS);
  }

  return {
    found: false,
    attempts,
    assignments: latestAssignments
  };
}

function addCheck({ checks, reasonCodes, id, pass, details, failureReasonCode }) {
  checks.push({
    id,
    pass,
    details
  });

  if (!pass && failureReasonCode) {
    reasonCodes.push(failureReasonCode);
  }
}

async function main() {
  const startedAt = Date.now();
  const headSha = getHeadSha();
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const subscriptionId = requireEnv("AZURE_SUBSCRIPTION_ID");
  const sessionPoolName = requireEnv("DYNAMIC_SESSIONS_POOL_NAME");
  const sessionExecutorIdentityName = requireEnv("DYNAMIC_SESSIONS_EXECUTOR_IDENTITY_NAME");
  const expectedRuntimeImage = requireEnv("RELEASE_CANDIDATE_DYNAMIC_SESSIONS_RUNTIME_REF");
  const expectedRoleDefinitionId = `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/${SESSION_EXECUTOR_ROLE_DEFINITION_GUID}`;

  const checks = [];
  const reasonCodes = [];
  let runtimeError = "";
  const observed = {
    sessionPool: {},
    sessionExecutorIdentity: {},
    roleAssignment: {}
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

    const provisioningState = readProvisioningState(sessionPool);
    const runtimeImage = String(
      sessionPool?.properties?.customContainerTemplate?.containers?.[0]?.image || ""
    ).trim();
    const managementEndpoint = String(sessionPool?.properties?.poolManagementEndpoint || "").trim();
    const sessionNetworkStatus = String(
      sessionPool?.properties?.sessionNetworkConfiguration?.status || ""
    ).trim();

    observed.sessionPool = {
      id: String(sessionPool?.id || ""),
      name: String(sessionPool?.name || sessionPoolName),
      provisioningState,
      runtimeImage,
      managementEndpoint,
      sessionNetworkStatus
    };

    addCheck({
      checks,
      reasonCodes,
      id: "session-pool-provisioning-succeeded",
      pass: provisioningState.toLowerCase() === "succeeded",
      details: `provisioningState=${provisioningState || "unknown"}`,
      failureReasonCode: "SESSION_POOL_PROVISIONING_NOT_SUCCEEDED"
    });

    addCheck({
      checks,
      reasonCodes,
      id: "session-pool-runtime-image-matches-release-candidate",
      pass: runtimeImage === expectedRuntimeImage,
      details: `expected=${expectedRuntimeImage}, actual=${runtimeImage || "(empty)"}`,
      failureReasonCode: "SESSION_POOL_IMAGE_MISMATCH"
    });

    addCheck({
      checks,
      reasonCodes,
      id: "session-pool-management-endpoint-https",
      pass: managementEndpoint.startsWith("https://"),
      details: `poolManagementEndpoint=${managementEndpoint || "(empty)"}`,
      failureReasonCode: "SESSION_POOL_MANAGEMENT_ENDPOINT_INVALID"
    });

    addCheck({
      checks,
      reasonCodes,
      id: "session-pool-network-status-egress-enabled",
      pass: sessionNetworkStatus === EXPECTED_NETWORK_STATUS,
      details: `expected=${EXPECTED_NETWORK_STATUS}, actual=${sessionNetworkStatus || "(empty)"}`,
      failureReasonCode: "SESSION_POOL_NETWORK_STATUS_INVALID"
    });

    const sessionExecutorIdentity = await runJson("az", [
      "identity",
      "show",
      "--resource-group",
      resourceGroup,
      "--name",
      sessionExecutorIdentityName,
      "--query",
      "{id:id,clientId:clientId,principalId:principalId}",
      "--output",
      "json"
    ]);

    const sessionExecutorPrincipalId = String(sessionExecutorIdentity?.principalId || "").trim();
    observed.sessionExecutorIdentity = {
      id: String(sessionExecutorIdentity?.id || ""),
      name: sessionExecutorIdentityName,
      clientId: String(sessionExecutorIdentity?.clientId || ""),
      principalId: sessionExecutorPrincipalId
    };

    addCheck({
      checks,
      reasonCodes,
      id: "session-executor-identity-has-principal-id",
      pass: sessionExecutorPrincipalId.length > 0,
      details: `principalId=${sessionExecutorPrincipalId || "(empty)"}`,
      failureReasonCode: "SESSION_EXECUTOR_IDENTITY_INVALID"
    });

    if (sessionExecutorPrincipalId && observed.sessionPool.id) {
      const roleAssignmentStatus = await waitForExpectedRoleAssignment({
        assigneeObjectId: sessionExecutorPrincipalId,
        scope: observed.sessionPool.id,
        expectedRoleDefinitionId
      });

      observed.roleAssignment = {
        expectedRoleDefinitionId,
        attempts: roleAssignmentStatus.attempts,
        matchingAssignmentFound: roleAssignmentStatus.found,
        assignmentCount: roleAssignmentStatus.assignments.length
      };

      addCheck({
        checks,
        reasonCodes,
        id: "session-executor-role-assignment-present-at-pool-scope",
        pass: roleAssignmentStatus.found,
        details: `expectedRoleDefinitionId=${expectedRoleDefinitionId}, attempts=${roleAssignmentStatus.attempts}, assignments=${roleAssignmentStatus.assignments.length}`,
        failureReasonCode: "SESSION_EXECUTOR_ROLE_ASSIGNMENT_MISSING"
      });
    } else {
      addCheck({
        checks,
        reasonCodes,
        id: "session-executor-role-assignment-present-at-pool-scope",
        pass: false,
        details:
          "Skipped role assignment lookup because identity principal ID or session pool ID is missing",
        failureReasonCode: "SESSION_EXECUTOR_ROLE_ASSIGNMENT_MISSING"
      });
    }
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : String(error);
    reasonCodes.push("DYNAMIC_SESSIONS_CONVERGENCE_RUNTIME_ERROR");
  }

  const failedChecks = checks.filter((check) => !check.pass);
  const status = runtimeError.length === 0 && failedChecks.length === 0 ? "pass" : "fail";
  const artifactPath = path.join(
    ".artifacts",
    "infra",
    headSha,
    "dynamic-sessions-convergence.json"
  );

  await writeArtifact(artifactPath, {
    schemaVersion: "1",
    generatedAt: new Date().toISOString(),
    headSha,
    status,
    reasonCodes,
    runtimeError,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    expected: {
      runtimeImage: expectedRuntimeImage,
      networkStatus: EXPECTED_NETWORK_STATUS,
      roleDefinitionId: expectedRoleDefinitionId
    },
    observed,
    checks
  });

  await appendGithubOutput({
    dynamic_sessions_convergence_path: artifactPath,
    dynamic_sessions_convergence_status: status
  });

  if (status !== "pass") {
    throw new Error(
      `Dynamic Sessions convergence verification failed (${reasonCodes.join(", ") || "UNKNOWN"})`
    );
  }

  return { status: "pass", code: "DYNAMIC_SESSIONS_CONVERGENCE_PASS" };
}

void withCcsGuardrail({
  guardrailId: "deployment.dynamic-sessions-convergence",
  command: "node scripts/pipeline/cloud/deployment-stage/verify-dynamic-sessions-convergence.mjs",
  passCode: "DYNAMIC_SESSIONS_CONVERGENCE_PASS",
  passRef: "docs/ccs.md#output-format",
  run: main,
  mapError: (error) => ({
    code: "DYNAMIC_SESSIONS_CONVERGENCE_RUNTIME_ERROR",
    why: error instanceof Error ? error.message : String(error),
    fix: "Resolve dynamic sessions convergence failures before promotion.",
    doCommands: [
      "node scripts/pipeline/cloud/deployment-stage/verify-dynamic-sessions-convergence.mjs"
    ],
    ref: "docs/ccs.md#output-format"
  })
});
