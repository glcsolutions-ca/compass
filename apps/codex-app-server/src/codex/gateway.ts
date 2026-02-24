import { randomInt } from "node:crypto";
import {
  type ChildProcessWithoutNullStreams,
  spawn as spawnProcess,
  type SpawnOptionsWithoutStdio
} from "node:child_process";
import { mkdir } from "node:fs/promises";
import type { CodexAppConfig } from "../config/index.js";
import type { WebSocketHub } from "../realtime/ws-hub.js";
import type { PersistenceRepository } from "../storage/repository.js";
import { type JsonRpcId, CodexRpcError } from "./jsonrpc.js";
import { CodexRpcClient } from "./rpc-client.js";

interface LoggerLike {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

interface PendingApproval {
  id: JsonRpcId;
  method: string;
  threadId: string | null;
}

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

export class CodexGateway {
  private readonly config: CodexAppConfig;
  private readonly repository: PersistenceRepository;
  private readonly hub: WebSocketHub;
  private readonly logger: LoggerLike;
  private readonly spawnFn: SpawnFn;

  private client: CodexRpcClient | null = null;
  private child: ChildProcessWithoutNullStreams | null = null;
  private startPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private restartDelayMs = 1_000;
  private restartTimer: NodeJS.Timeout | null = null;
  private readonly pendingApprovals = new Map<string, PendingApproval>();

  constructor(options: {
    config: CodexAppConfig;
    repository: PersistenceRepository;
    hub: WebSocketHub;
    logger: LoggerLike;
    spawnFn?: SpawnFn;
  }) {
    this.config = options.config;
    this.repository = options.repository;
    this.hub = options.hub;
    this.logger = options.logger;
    this.spawnFn = options.spawnFn ?? spawnProcess;
  }

  async start(): Promise<void> {
    if (this.client) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
      this.restartDelayMs = 1_000;
    } finally {
      this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.client) {
      this.client.close();
      this.client = null;
    }

    if (this.child) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    await this.start();

    if (!this.client) {
      throw new Error("Codex gateway is unavailable");
    }

    const maxAttempts = 4;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        return await this.client.request(method, params);
      } catch (error) {
        if (
          !(error instanceof CodexRpcError) ||
          error.code !== -32001 ||
          attempt === maxAttempts - 1
        ) {
          throw error;
        }

        const delayMs = this.retryDelay(attempt);
        this.logger.warn(
          { method, attempt: attempt + 1, delayMs },
          "Codex overloaded; retrying request"
        );
        await sleep(delayMs);
      }

      attempt += 1;
    }

    throw new Error(`Failed to execute request after ${maxAttempts} attempts: ${method}`);
  }

  async respondApproval(requestId: string, decision: "accept" | "decline"): Promise<void> {
    await this.start();

    if (!this.client) {
      throw new Error("Codex gateway is unavailable");
    }

    const pending = this.pendingApprovals.get(requestId);
    if (!pending) {
      throw new Error(`No pending approval with request id ${requestId}`);
    }

    await this.client.respond(pending.id, { decision });
    this.pendingApprovals.delete(requestId);

    await this.repository.resolveApproval(requestId, decision);

    this.hub.broadcast(pending.threadId, {
      type: "approval.resolved",
      requestId,
      payload: {
        decision
      }
    });
  }

  private async startInternal(): Promise<void> {
    await mkdir(this.config.codexHome, { recursive: true });

    this.logger.info(
      { codexBinPath: this.config.codexBinPath, codexHome: this.config.codexHome },
      "Starting codex app-server process"
    );

    const child = this.spawnFn(this.config.codexBinPath, ["app-server", "--listen", "stdio://"], {
      env: {
        ...process.env,
        CODEX_HOME: this.config.codexHome,
        OPENAI_API_KEY: this.config.serviceApiKey ?? process.env.OPENAI_API_KEY ?? ""
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    child.stderr.on("data", (chunk: Buffer) => {
      this.logger.warn({ stderr: chunk.toString("utf8") }, "codex app-server stderr");
    });

    child.on("exit", (code, signal) => {
      this.logger.warn({ code, signal }, "codex app-server process exited");
      this.client = null;
      this.child = null;
      this.pendingApprovals.clear();
      if (!this.shuttingDown) {
        this.scheduleRestart();
      }
    });

    const client = new CodexRpcClient(child.stdout, child.stdin, this.logger);
    client.on("notification", (notification) => {
      void this.handleNotification(notification.method, notification.params);
    });

    client.on("request", (request) => {
      void this.handleServerRequest(request.id, request.method, request.params);
    });

    client.on("disconnected", () => {
      this.client = null;
    });

    await client.request("initialize", {
      clientInfo: {
        name: this.config.clientName,
        title: "Compass Codex Gateway",
        version: this.config.clientVersion
      },
      capabilities: {
        experimentalApi: true
      }
    });

    await client.notify("initialized", {});

    this.client = client;
    this.child = child;

    this.logger.info("Codex gateway initialized successfully");
  }

  private retryDelay(attempt: number): number {
    const base = Math.min(8_000, 300 * 2 ** attempt);
    const jitter = randomInt(0, Math.floor(base / 2) + 1);
    return base + jitter;
  }

  private scheduleRestart(): void {
    if (this.restartTimer || this.shuttingDown) {
      return;
    }

    const delayMs = this.restartDelayMs;
    this.restartDelayMs = Math.min(30_000, this.restartDelayMs * 2);

    this.logger.info({ delayMs }, "Scheduling codex process restart");

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.start().catch((error: unknown) => {
        this.logger.error({ err: error }, "Failed to restart codex app-server process");
        this.scheduleRestart();
      });
    }, delayMs);
  }

  private async handleNotification(method: string, params: unknown): Promise<void> {
    const threadId = extractThreadId(params);
    const turnId = extractTurnId(params);

    await this.repository.insertEvent(threadId, turnId, method, params ?? null);

    if (method === "thread/started") {
      const thread = asRecord(params).thread;
      await this.repository.upsertThread(thread);
    }

    if (method === "turn/started" || method === "turn/completed") {
      const turn = asRecord(params).turn;
      const derivedThreadId = threadId ?? extractThreadId(turn);
      if (derivedThreadId) {
        await this.repository.upsertTurn(derivedThreadId, turn);
      }
    }

    if (method === "item/started" || method === "item/completed") {
      const item = asRecord(params).item;
      if (threadId && turnId) {
        await this.repository.upsertItem(
          threadId,
          turnId,
          item,
          method === "item/completed" ? "completed" : "started"
        );
      }
    }

    if (method === "account/updated") {
      const payload = asRecord(params);
      await this.repository.upsertAuthState(
        readString(payload, "authMode") ?? null,
        payload.account ?? null
      );
    }

    const streamType = mapNotificationToStreamType(method);
    if (!streamType) {
      return;
    }

    this.hub.broadcast(threadId, {
      type: streamType,
      method,
      payload: params ?? null
    });
  }

  private async handleServerRequest(id: JsonRpcId, method: string, params: unknown): Promise<void> {
    const requestId = String(id);

    if (
      method === "item/commandExecution/requestApproval" ||
      method === "item/fileChange/requestApproval"
    ) {
      const threadId = extractThreadId(params);

      this.pendingApprovals.set(requestId, {
        id,
        method,
        threadId
      });

      await this.repository.insertApproval(requestId, method, params);

      this.hub.broadcast(threadId, {
        type: "approval.requested",
        method,
        requestId,
        payload: params ?? null
      });

      return;
    }

    this.logger.warn({ method }, "Unsupported server request from codex app-server");

    if (!this.client) {
      return;
    }

    await this.client.respondError(id, {
      code: -32601,
      message: `Unsupported server request method: ${method}`
    });
  }
}

export function mapNotificationToStreamType(
  method: string
):
  | "thread.started"
  | "turn.started"
  | "item.started"
  | "item.delta"
  | "item.completed"
  | "turn.completed"
  | "error"
  | null {
  if (method === "thread/started") {
    return "thread.started";
  }

  if (method === "turn/started") {
    return "turn.started";
  }

  if (method === "turn/completed") {
    return "turn.completed";
  }

  if (method === "item/started") {
    return "item.started";
  }

  if (method === "item/completed") {
    return "item.completed";
  }

  if (method === "error") {
    return "error";
  }

  if (method.startsWith("item/")) {
    return "item.delta";
  }

  return null;
}

function extractThreadId(value: unknown): string | null {
  return searchNestedString(value, ["threadId", "thread_id"]);
}

function extractTurnId(value: unknown): string | null {
  return searchNestedString(value, ["turnId", "turn_id"]);
}

function searchNestedString(value: unknown, keys: string[]): string | null {
  const seen = new Set<unknown>();
  const queue: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }

    const { node, depth } = next;
    if (depth > 3 || node === null || typeof node !== "object") {
      continue;
    }

    if (seen.has(node)) {
      continue;
    }
    seen.add(node);

    const record = node as Record<string, unknown>;
    for (const key of keys) {
      const valueForKey = record[key];
      if (typeof valueForKey === "string" && valueForKey.length > 0) {
        return valueForKey;
      }
    }

    for (const child of Object.values(record)) {
      if (child && typeof child === "object") {
        queue.push({ node: child, depth: depth + 1 });
      }
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
