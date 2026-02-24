import { EventEmitter } from "node:events";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import readline from "node:readline";
import { PassThrough } from "node:stream";

type JsonRpcId = string | number;

interface JsonRpcRequestLike {
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcNotificationLike {
  method: string;
  params?: unknown;
}

interface JsonRpcResponseLike {
  id: JsonRpcId;
  result?: unknown;
  error?: unknown;
}

function isRequest(value: unknown): value is JsonRpcRequestLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (typeof record.id === "string" || typeof record.id === "number") &&
    typeof record.method === "string"
  );
}

function isNotification(value: unknown): value is JsonRpcNotificationLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.id === undefined && typeof record.method === "string";
}

function isResponse(value: unknown): value is JsonRpcResponseLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    (typeof record.id === "string" || typeof record.id === "number") &&
    (Object.prototype.hasOwnProperty.call(record, "result") ||
      Object.prototype.hasOwnProperty.call(record, "error"))
  );
}

interface PendingServerResponse {
  resolve: (value: JsonRpcResponseLike) => void;
  reject: (error: Error) => void;
}

export interface FakeCodexInboundMessage {
  processId: number;
  message: unknown;
}

export interface FakeCodexHandlerContext {
  processId: number;
  id: JsonRpcId;
  method: string;
  params: unknown;
  server: FakeCodexServer;
}

type FakeCodexMethodHandler = (context: FakeCodexHandlerContext) => Promise<void> | void;

class FakeCodexChildProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdio = [this.stdin, this.stdout, this.stderr] as const;
  readonly spawnfile = "fake-codex";
  readonly spawnargs = ["fake-codex", "app-server", "--listen", "stdio://"];
  readonly pid = process.pid;

  connected = true;
  killed = false;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  constructor(
    private readonly processId: number,
    private readonly server: FakeCodexServer
  ) {
    super();

    const reader = readline.createInterface({ input: this.stdin });
    reader.on("line", (line) => {
      this.server.handleInboundLine(this.processId, line);
    });
  }

  disconnect(): void {
    this.connected = false;
  }

  ref(): void {}

  send(): boolean {
    return true;
  }

  unref(): void {}

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this.killed = true;
    this.signalCode = signal;
    this.emit("exit", this.exitCode, signal);
    return true;
  }

  emitExit(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }

  pushCodexMessage(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

export class FakeCodexServer {
  private readonly methodHandlers = new Map<string, FakeCodexMethodHandler>();
  private readonly processes = new Map<number, FakeCodexChildProcess>();
  private readonly pendingServerResponses = new Map<string, PendingServerResponse>();
  private defaultRequestHandler: FakeCodexMethodHandler | null = null;
  private nextProcessId = 1;
  private nextServerRequestId = 10_000;

  readonly receivedMessages: FakeCodexInboundMessage[] = [];
  readonly sentMessages: FakeCodexInboundMessage[] = [];

  constructor() {
    this.onRequest("initialize", ({ id, processId }) => {
      this.respond(processId, id, {
        capabilities: {}
      });
    });
  }

  get spawnCount(): number {
    return this.processes.size;
  }

  get latestProcessId(): number {
    if (this.processes.size === 0) {
      throw new Error("No fake codex process has been spawned");
    }
    return [...this.processes.keys()].at(-1) ?? 0;
  }

  get spawnFn() {
    return (
      _command: string,
      _args: readonly string[],
      _options: SpawnOptionsWithoutStdio
    ): ChildProcessWithoutNullStreams => {
      const processId = this.nextProcessId;
      this.nextProcessId += 1;

      const child = new FakeCodexChildProcess(processId, this);
      this.processes.set(processId, child);
      return child as unknown as ChildProcessWithoutNullStreams;
    };
  }

  onRequest(method: string, handler: FakeCodexMethodHandler): void {
    this.methodHandlers.set(method, handler);
  }

  onAnyRequest(handler: FakeCodexMethodHandler): void {
    this.defaultRequestHandler = handler;
  }

  respond(processId: number, id: JsonRpcId, result: unknown): void {
    const child = this.requireProcess(processId);
    const message = { id, result };
    this.sentMessages.push({
      processId,
      message
    });
    child.pushCodexMessage(message);
  }

  respondError(
    processId: number,
    id: JsonRpcId | null,
    error: { code: number; message: string; data?: unknown }
  ): void {
    const child = this.requireProcess(processId);
    const message = { id, error };
    this.sentMessages.push({
      processId,
      message
    });
    child.pushCodexMessage(message);
  }

  notify(method: string, params?: unknown, processId: number = this.latestProcessId): void {
    const child = this.requireProcess(processId);
    const message = { method, params };
    this.sentMessages.push({
      processId,
      message
    });
    child.pushCodexMessage(message);
  }

  request(method: string, params?: unknown, processId: number = this.latestProcessId): string {
    const child = this.requireProcess(processId);
    const id = String(this.nextServerRequestId);
    this.nextServerRequestId += 1;
    const message = { id, method, params };
    this.sentMessages.push({
      processId,
      message
    });
    child.pushCodexMessage(message);
    return id;
  }

  exitProcess(processId: number = this.latestProcessId, code: number | null = 1): void {
    const child = this.requireProcess(processId);
    child.emitExit(code, null);
  }

  waitForServerResponse(requestId: string, timeoutMs = 2_000): Promise<JsonRpcResponseLike> {
    return new Promise<JsonRpcResponseLike>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingServerResponses.delete(requestId);
        reject(new Error(`Timed out waiting for gateway response to request ${requestId}`));
      }, timeoutMs);

      this.pendingServerResponses.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          this.pendingServerResponses.delete(requestId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.pendingServerResponses.delete(requestId);
          reject(error);
        }
      });
    });
  }

  async waitFor(
    predicate: (messages: FakeCodexInboundMessage[]) => boolean,
    timeoutMs = 2_000
  ): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      if (predicate(this.receivedMessages)) {
        return;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }

    throw new Error("Timed out waiting for fake codex condition");
  }

  handleInboundLine(processId: number, line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(trimmed);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON from gateway: ${details}`, {
        cause: error
      });
    }

    this.receivedMessages.push({
      processId,
      message
    });

    if (isRequest(message)) {
      void this.handleRequest(processId, message);
      return;
    }

    if (isNotification(message)) {
      return;
    }

    if (isResponse(message)) {
      const pending = this.pendingServerResponses.get(String(message.id));
      if (pending) {
        pending.resolve(message);
      }
      return;
    }
  }

  private async handleRequest(processId: number, message: JsonRpcRequestLike): Promise<void> {
    const handler = this.methodHandlers.get(message.method) ?? this.defaultRequestHandler;
    if (!handler) {
      this.respond(processId, message.id, {});
      return;
    }

    try {
      await handler({
        processId,
        id: message.id,
        method: message.method,
        params: message.params,
        server: this
      });
    } catch (error) {
      this.respondError(processId, message.id, {
        code: -32603,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private requireProcess(processId: number): FakeCodexChildProcess {
    const process = this.processes.get(processId);
    if (!process) {
      throw new Error(`Unknown fake codex process id ${processId}`);
    }
    return process;
  }
}
