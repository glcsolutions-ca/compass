import { EventEmitter } from "node:events";
import readline from "node:readline";
import {
  type JsonRpcErrorShape,
  type JsonRpcId,
  type JsonRpcNotification,
  type JsonRpcRequest,
  CodexRpcError,
  isJsonRpcError,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse
} from "./jsonrpc.js";

interface LoggerLike {
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  method: string;
}

interface RpcClientEvents {
  notification: (notification: JsonRpcNotification) => void;
  request: (request: JsonRpcRequest) => void;
  disconnected: () => void;
}

const DEFAULT_LOGGER: LoggerLike = {
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  info: (...args) => console.info(...args),
  debug: (...args) => console.debug(...args)
};

export class CodexRpcClient extends EventEmitter {
  private readonly reader: readline.Interface;
  private readonly writable: NodeJS.WritableStream;
  private readonly logger: LoggerLike;
  private nextRequestId = 0;
  private writeChain = Promise.resolve();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private isClosed = false;

  constructor(
    readable: NodeJS.ReadableStream,
    writable: NodeJS.WritableStream,
    logger?: LoggerLike
  ) {
    super();
    this.reader = readline.createInterface({ input: readable });
    this.writable = writable;
    this.logger = logger ?? DEFAULT_LOGGER;

    this.reader.on("line", (line) => {
      void this.handleLine(line);
    });

    this.reader.on("close", () => {
      this.close();
    });
  }

  override on<EventName extends keyof RpcClientEvents>(
    eventName: EventName,
    listener: RpcClientEvents[EventName]
  ): this {
    return super.on(eventName, listener as (...args: unknown[]) => void);
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (this.isClosed) {
      throw new Error("RPC client is closed");
    }

    const id = this.allocateRequestId();

    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, method });
    });

    await this.writeMessage({ id, method, params });
    return promise;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    if (this.isClosed) {
      throw new Error("RPC client is closed");
    }

    await this.writeMessage({ method, params });
  }

  async respond(id: JsonRpcId, result: unknown): Promise<void> {
    if (this.isClosed) {
      throw new Error("RPC client is closed");
    }

    await this.writeMessage({ id, result });
  }

  async respondError(id: JsonRpcId | null, error: JsonRpcErrorShape): Promise<void> {
    if (this.isClosed) {
      throw new Error("RPC client is closed");
    }

    await this.writeMessage({ id, error });
  }

  close(): void {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.reader.close();

    for (const [requestId, pending] of this.pendingRequests) {
      pending.reject(new Error(`RPC connection closed before response for ${pending.method}`));
      this.pendingRequests.delete(requestId);
    }

    this.emit("disconnected");
  }

  private allocateRequestId(): string {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return String(id);
  }

  private async writeMessage(value: unknown): Promise<void> {
    const payload = JSON.stringify(value);

    this.writeChain = this.writeChain.then(
      () =>
        new Promise<void>((resolve, reject) => {
          this.writable.write(`${payload}\n`, (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        })
    );

    return this.writeChain;
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      this.logger.warn(
        { err: error, payload: line },
        "Failed to parse JSON-RPC message from codex"
      );
      return;
    }

    if (isJsonRpcNotification(parsed)) {
      this.emit("notification", parsed);
      return;
    }

    if (isJsonRpcRequest(parsed)) {
      this.emit("request", parsed);
      return;
    }

    if (isJsonRpcResponse(parsed)) {
      const pending = this.pendingRequests.get(String(parsed.id));
      if (!pending) {
        this.logger.warn({ id: parsed.id }, "Received JSON-RPC response without matching request");
        return;
      }

      this.pendingRequests.delete(String(parsed.id));
      pending.resolve(parsed.result);
      return;
    }

    if (isJsonRpcError(parsed)) {
      const pending = this.pendingRequests.get(String(parsed.id));
      if (!pending) {
        this.logger.warn(
          { id: parsed.id, error: parsed.error },
          "Received JSON-RPC error without matching request"
        );
        return;
      }

      this.pendingRequests.delete(String(parsed.id));
      pending.reject(new CodexRpcError(parsed.error.code, parsed.error.message, parsed.error.data));
      return;
    }

    this.logger.warn({ payload: parsed }, "Dropping unknown JSON-RPC message shape");
  }
}
