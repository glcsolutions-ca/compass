export type WorkerRunMode = "loop" | "once";

export interface WorkerConfig {
  serviceBusFullyQualifiedNamespace: string;
  azureClientId: string;
  queueName: string;
  runMode: WorkerRunMode;
  maxMessages: number;
  maxWaitSeconds: number;
}

function parsePositiveInt(name: string, value: string | undefined, fallback: number) {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  if (parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const serviceBusFullyQualifiedNamespace = env.SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE?.trim() || "";
  const azureClientId = env.AZURE_CLIENT_ID?.trim() || "";
  const queueName = env.SERVICE_BUS_QUEUE_NAME?.trim() || "";
  const runModeCandidate = env.WORKER_RUN_MODE?.trim().toLowerCase() || "loop";

  if (!serviceBusFullyQualifiedNamespace) {
    throw new Error("SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE is required");
  }

  if (!azureClientId) {
    throw new Error("AZURE_CLIENT_ID is required");
  }

  if (!queueName) {
    throw new Error("SERVICE_BUS_QUEUE_NAME is required");
  }

  if (runModeCandidate !== "loop" && runModeCandidate !== "once") {
    throw new Error(`WORKER_RUN_MODE must be 'loop' or 'once' (received: ${runModeCandidate})`);
  }
  const runMode: WorkerRunMode = runModeCandidate;

  const maxMessages = parsePositiveInt("WORKER_MAX_MESSAGES", env.WORKER_MAX_MESSAGES, 10);
  const maxWaitSeconds = parsePositiveInt(
    "WORKER_MAX_WAIT_SECONDS",
    env.WORKER_MAX_WAIT_SECONDS,
    15
  );

  return {
    serviceBusFullyQualifiedNamespace,
    azureClientId,
    queueName,
    runMode,
    maxMessages,
    maxWaitSeconds
  };
}
