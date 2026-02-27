import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { requireEnv } from "../../shared/pipeline-utils.mjs";

const execFileAsync = promisify(execFile);

async function azJson(args) {
  const { stdout } = await execFileAsync("az", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8
  });
  return JSON.parse(stdout);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getEnvValue(containerEnv, name) {
  const found = containerEnv.find((entry) => entry.name === name);
  if (!found) {
    return "";
  }
  return String(found.value ?? "");
}

function normalizePrincipalId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

const legacyConnectionStringEnvName = ["AZURE", "SERVICE", "BUS", "CONNECTION", "STRING"].join("_");

async function verifyNamespaceLocalAuthDisabled(resourceGroup, namespaceName) {
  const namespace = await azJson([
    "servicebus",
    "namespace",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    namespaceName,
    "--query",
    "{name:name,disableLocalAuth:disableLocalAuth}",
    "--output",
    "json"
  ]);

  assert(
    namespace.disableLocalAuth === true,
    `Service Bus namespace ${namespaceName} must have disableLocalAuth=true`
  );
}

async function main() {
  const resourceGroup = requireEnv("AZURE_RESOURCE_GROUP");
  const subscriptionId = requireEnv("AZURE_SUBSCRIPTION_ID");
  const workerAppName = requireEnv("ACA_WORKER_APP_NAME");
  const serviceBusProdNamespaceName = requireEnv("SERVICE_BUS_PROD_NAMESPACE_NAME");
  const serviceBusQueueName = requireEnv("SERVICE_BUS_QUEUE_NAME");
  const workerRuntimeIdentityName = process.env.WORKER_RUNTIME_IDENTITY_NAME?.trim() || "";
  const workerRuntimeIdentityClientIdFromEnv =
    process.env.WORKER_RUNTIME_IDENTITY_CLIENT_ID?.trim() || "";
  const workerRuntimeIdentityPrincipalIdFromEnv =
    process.env.WORKER_RUNTIME_IDENTITY_PRINCIPAL_ID?.trim() || "";

  await verifyNamespaceLocalAuthDisabled(resourceGroup, serviceBusProdNamespaceName);

  const workerApp = await azJson([
    "containerapp",
    "show",
    "--resource-group",
    resourceGroup,
    "--name",
    workerAppName,
    "--query",
    "{provisioningState:properties.provisioningState,runningStatus:properties.runningStatus,env:properties.template.containers[0].env,secrets:properties.configuration.secrets}",
    "--output",
    "json"
  ]);

  assert(
    workerApp.provisioningState === "Succeeded",
    "Worker container app provisioning must succeed"
  );
  assert(workerApp.runningStatus === "Running", "Worker container app must be running");

  const workerEnv = Array.isArray(workerApp.env) ? workerApp.env : [];
  const workerSecrets = Array.isArray(workerApp.secrets) ? workerApp.secrets : [];
  const legacyEnv = workerEnv.find((entry) => entry.name === legacyConnectionStringEnvName);
  assert(!legacyEnv, `Worker container app must not expose ${legacyConnectionStringEnvName}`);

  const legacySecret = workerSecrets.find(
    (entry) => entry.name === "service-bus-connection-string"
  );
  assert(
    !legacySecret,
    "Worker container app must not include service-bus-connection-string secret"
  );

  const expectedNamespaceFqdn = `${serviceBusProdNamespaceName}.servicebus.windows.net`;
  const configuredNamespaceFqdn = getEnvValue(workerEnv, "SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE");
  assert(
    configuredNamespaceFqdn === expectedNamespaceFqdn,
    `Worker SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE must be ${expectedNamespaceFqdn}`
  );

  const configuredQueueName = getEnvValue(workerEnv, "SERVICE_BUS_QUEUE_NAME");
  assert(
    configuredQueueName === serviceBusQueueName,
    `Worker SERVICE_BUS_QUEUE_NAME must be ${serviceBusQueueName}`
  );

  let identity = {
    clientId: workerRuntimeIdentityClientIdFromEnv,
    principalId: workerRuntimeIdentityPrincipalIdFromEnv
  };

  if (!identity.clientId || !identity.principalId) {
    if (!workerRuntimeIdentityName) {
      throw new Error(
        "Set WORKER_RUNTIME_IDENTITY_CLIENT_ID and WORKER_RUNTIME_IDENTITY_PRINCIPAL_ID, or provide WORKER_RUNTIME_IDENTITY_NAME."
      );
    }

    identity = await azJson([
      "identity",
      "show",
      "--resource-group",
      resourceGroup,
      "--name",
      workerRuntimeIdentityName,
      "--query",
      "{clientId:clientId,principalId:principalId}",
      "--output",
      "json"
    ]);
  }

  const configuredClientId = getEnvValue(workerEnv, "AZURE_CLIENT_ID");
  assert(
    configuredClientId === identity.clientId,
    "Worker AZURE_CLIENT_ID must match runtime identity clientId"
  );

  const queue = await azJson([
    "servicebus",
    "queue",
    "show",
    "--resource-group",
    resourceGroup,
    "--namespace-name",
    serviceBusProdNamespaceName,
    "--name",
    serviceBusQueueName,
    "--query",
    "{id:id}",
    "--output",
    "json"
  ]);

  const queueRoleAssignments = await azJson([
    "role",
    "assignment",
    "list",
    "--scope",
    queue.id,
    "--output",
    "json"
  ]);
  const normalizedPrincipalId = normalizePrincipalId(identity.principalId);
  const roleAssignments = queueRoleAssignments
    .filter((assignment) => normalizePrincipalId(assignment?.principalId) === normalizedPrincipalId)
    .filter((assignment) => assignment?.roleDefinitionName === "Azure Service Bus Data Receiver")
    .map((assignment) => ({
      role: assignment.roleDefinitionName,
      id: assignment.id,
      roleDefinitionId: assignment.roleDefinitionId
    }));

  assert(
    Array.isArray(roleAssignments) && roleAssignments.length > 0,
    `Missing Azure Service Bus Data Receiver role assignment for worker runtime identity on queue ${serviceBusQueueName}`
  );

  const expectedRoleDefinitionId = `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0`;
  const hasExpectedRoleDefinition = roleAssignments.some(
    (assignment) =>
      String(assignment.roleDefinitionId || "").toLowerCase() ===
      expectedRoleDefinitionId.toLowerCase()
  );
  assert(
    hasExpectedRoleDefinition,
    "Worker runtime identity role assignment must use Azure Service Bus Data Receiver role definition"
  );

  console.info("Worker Service Bus cutover verification passed.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
