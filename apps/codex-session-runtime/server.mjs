import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import os from "node:os";

const host = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "8080", 10);
const engine = String(process.env.SESSION_RUNTIME_ENGINE || "mock")
  .trim()
  .toLowerCase();
const maxBodyBytes = Number.parseInt(process.env.MAX_BODY_BYTES || "1048576", 10);
const maxSleepMs = Number.parseInt(process.env.MOCK_ENGINE_MAX_SLEEP_MS || "5000", 10);
const codexRequestTimeoutMs = Number.parseInt(
  process.env.CODEX_RUNTIME_REQUEST_TIMEOUT_MS || "30000",
  10
);
const codexTurnTimeoutMs = Number.parseInt(
  process.env.CODEX_RUNTIME_TURN_TIMEOUT_MS || "120000",
  10
);
const codexInitTimeoutMs = Number.parseInt(
  process.env.CODEX_RUNTIME_INIT_TIMEOUT_MS || "30000",
  10
);
const codexMaxRestarts = Number.parseInt(process.env.CODEX_RUNTIME_MAX_RESTARTS || "2", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}

if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) {
  throw new Error("MAX_BODY_BYTES must be a positive integer");
}

if (!Number.isInteger(maxSleepMs) || maxSleepMs < 0) {
  throw new Error("MOCK_ENGINE_MAX_SLEEP_MS must be a non-negative integer");
}

if (!Number.isInteger(codexRequestTimeoutMs) || codexRequestTimeoutMs < 1000) {
  throw new Error("CODEX_RUNTIME_REQUEST_TIMEOUT_MS must be an integer >= 1000");
}

if (!Number.isInteger(codexTurnTimeoutMs) || codexTurnTimeoutMs < 1000) {
  throw new Error("CODEX_RUNTIME_TURN_TIMEOUT_MS must be an integer >= 1000");
}

if (!Number.isInteger(codexInitTimeoutMs) || codexInitTimeoutMs < 1000) {
  throw new Error("CODEX_RUNTIME_INIT_TIMEOUT_MS must be an integer >= 1000");
}

if (!Number.isInteger(codexMaxRestarts) || codexMaxRestarts < 0) {
  throw new Error("CODEX_RUNTIME_MAX_RESTARTS must be a non-negative integer");
}

const bootAt = Date.now();
const bootId = randomUUID();
const hostname = os.hostname();
let requestCount = 0;

const sessionStore = new Map();
const turnStore = new Map();

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function safeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function sleep(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readIdentifier(url) {
  const identifier = url.searchParams.get("identifier");
  if (!identifier || !identifier.trim()) {
    return null;
  }
  return identifier.trim();
}

function readString(value) {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return normalized;
}

function ensureSession(identifier) {
  const existing = sessionStore.get(identifier);
  const now = new Date().toISOString();

  if (existing) {
    existing.lastSeenAt = now;
    return existing;
  }

  const created = {
    identifier,
    sessionId: randomUUID(),
    createdAt: now,
    lastSeenAt: now,
    turnCount: 0,
    codexThreadId: null,
    codexBootstrappedAt: null
  };
  sessionStore.set(identifier, created);
  return created;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bufferChunk.byteLength;

    if (size > maxBodyBytes) {
      throw new Error("BODY_TOO_LARGE");
    }

    chunks.push(bufferChunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const bodyText = Buffer.concat(chunks).toString("utf8");
  if (!bodyText.trim()) {
    return {};
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function createRpcError(method, message, code = -32000) {
  const normalizedMethod = readString(method) || "unknown";
  const normalizedMessage = readString(message) || "RPC request failed";
  const error = new Error(`RPC ${normalizedMethod} failed (${String(code)}): ${normalizedMessage}`);
  error.name = "RpcRequestError";
  return error;
}

function isRecoverableTransportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /RPC_TRANSPORT_(DISCONNECTED|WRITE_FAILED|STARTUP_FAILED|TIMEOUT)/u.test(message);
}

class JsonRpcStdioProcess {
  constructor() {
    this.child = null;
    this.nextId = 1;
    this.startPromise = null;
    this.pending = new Map();
    this.notificationListeners = new Set();
    this.buffer = "";
    this.stderrTail = [];
    this.command = String(process.env.CODEX_APP_SERVER_COMMAND || "codex").trim() || "codex";
    this.args = String(process.env.CODEX_APP_SERVER_ARGS || "app-server")
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean);
    this.initialized = false;
    this.restartCount = 0;
    this.lastError = "";
    this.readyAt = null;
    this.apiKey = readString(process.env.OPENAI_API_KEY || "");
  }

  async ensureStarted() {
    if (this.child && !this.child.killed && this.initialized) {
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = this.startInternal();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async startInternal() {
    const child = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });

    this.child = child;
    this.initialized = false;
    this.buffer = "";

    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      this.stderrTail.push(text);
      if (this.stderrTail.length > 50) {
        this.stderrTail.shift();
      }
      process.stderr.write(text);
    });

    child.stdout.on("data", (chunk) => {
      this.handleStdoutChunk(String(chunk));
    });

    child.on("error", (error) => {
      this.lastError = `RPC_TRANSPORT_STARTUP_FAILED: ${error.message}`;
      this.rejectAllPending(new Error(this.lastError));
    });

    child.on("exit", (code, signal) => {
      const message = `RPC_TRANSPORT_DISCONNECTED: codex app server exited (code=${String(code)}, signal=${String(signal)})`;
      this.lastError = message;
      this.initialized = false;
      this.child = null;
      this.rejectAllPending(new Error(message));
      process.stderr.write(`${message}\n`);
    });

    try {
      await this.requestRaw(
        "initialize",
        {
          protocolVersion: "2",
          clientInfo: {
            name: "compass-codex-session-runtime",
            version: "0.1.0"
          },
          capabilities: null
        },
        codexInitTimeoutMs,
        true
      );

      await this.notify("initialized", {}, true);
      await this.ensureAccountAuth();

      this.initialized = true;
      this.readyAt = new Date().toISOString();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      await this.forceRestart();
      throw error;
    }
  }

  handleStdoutChunk(text) {
    this.buffer += text;

    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        const id = Number(message.id);
        const pending = this.pending.get(id);
        if (!pending) {
          continue;
        }

        this.pending.delete(id);
        clearTimeout(pending.timeout);

        if (message.error) {
          pending.reject(
            createRpcError(pending.method, message.error.message || "RPC error", message.error.code)
          );
          continue;
        }

        pending.resolve(message.result || {});
        continue;
      }

      if (message && typeof message.method === "string") {
        for (const listener of this.notificationListeners) {
          listener({
            method: message.method,
            params: message.params || {}
          });
        }
      }
    }
  }

  rejectAllPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async request(method, params, timeoutMs = codexRequestTimeoutMs) {
    return this.requestWithRestart(method, params, timeoutMs);
  }

  async requestWithRestart(method, params, timeoutMs = codexRequestTimeoutMs) {
    let attempt = 0;

    while (true) {
      try {
        await this.ensureStarted();
        return await this.requestRaw(method, params, timeoutMs, true);
      } catch (error) {
        if (attempt >= codexMaxRestarts || !isRecoverableTransportError(error)) {
          throw error;
        }

        attempt += 1;
        this.restartCount += 1;
        this.lastError = error instanceof Error ? error.message : String(error);
        await this.forceRestart();
      }
    }
  }

  async requestRaw(method, params, timeoutMs, skipEnsureStarted = false) {
    if (!skipEnsureStarted) {
      await this.ensureStarted();
    }

    const child = this.child;
    if (!child || child.killed || !child.stdin) {
      throw new Error("RPC_TRANSPORT_DISCONNECTED: app server process is unavailable");
    }

    const id = this.nextId++;

    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {}
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(`RPC_TRANSPORT_TIMEOUT: ${method} timed out after ${String(timeoutMs)}ms`)
        );
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve,
        reject,
        timeout
      });

      child.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }

        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }

        this.pending.delete(id);
        clearTimeout(timeout);
        reject(new Error(`RPC_TRANSPORT_WRITE_FAILED: ${error.message}`));
      });
    });
  }

  async notify(method, params, skipEnsureStarted = false) {
    if (!skipEnsureStarted) {
      await this.ensureStarted();
    }

    const child = this.child;
    if (!child || child.killed || !child.stdin) {
      throw new Error("RPC_TRANSPORT_DISCONNECTED: app server process is unavailable");
    }

    return new Promise((resolve, reject) => {
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", method, params: params ?? {} })}\n`,
        "utf8",
        (error) => {
          if (error) {
            reject(new Error(`RPC_TRANSPORT_WRITE_FAILED: ${error.message}`));
            return;
          }
          resolve();
        }
      );
    });
  }

  subscribe(listener) {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  async ensureAccountAuth() {
    let accountRead;
    try {
      accountRead = await this.requestRaw("account/read", {}, codexInitTimeoutMs, true);
    } catch {
      return;
    }

    const existingAccountType = readString(accountRead?.account?.type);
    if (existingAccountType) {
      return;
    }

    if (!this.apiKey) {
      return;
    }

    await this.requestRaw(
      "account/login/start",
      {
        type: "apiKey",
        apiKey: this.apiKey
      },
      codexInitTimeoutMs,
      true
    );

    const postLogin = await this.requestRaw("account/read", {}, codexInitTimeoutMs, true);
    const loggedInType = readString(postLogin?.account?.type);
    if (!loggedInType) {
      throw new Error("RPC account/login/start did not produce an authenticated account state");
    }
  }

  async forceRestart() {
    const child = this.child;
    this.initialized = false;
    this.child = null;

    if (!child || child.killed) {
      return;
    }

    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 1000);

      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });

      child.kill("SIGTERM");
    });
  }

  health() {
    return {
      command: this.command,
      args: this.args,
      running: Boolean(this.child && !this.child.killed),
      initialized: this.initialized,
      pid: this.child?.pid || null,
      readyAt: this.readyAt,
      restartCount: this.restartCount,
      lastError: this.lastError,
      stderrTail: this.stderrTail.slice(-10)
    };
  }

  stop() {
    void this.forceRestart();
  }
}

class CodexAppServerProcess {
  constructor() {
    this.rpc = new JsonRpcStdioProcess();
  }

  async bootstrapSession(session) {
    if (readString(session.codexThreadId)) {
      return session;
    }

    const response = await this.rpc.request("thread/start", {
      cwd: process.cwd()
    });

    const codexThreadId = readString(response?.thread?.id || response?.threadId);
    if (!codexThreadId) {
      throw new Error("Codex thread bootstrap response did not include thread.id");
    }

    session.codexThreadId = codexThreadId;
    session.codexBootstrappedAt = new Date().toISOString();
    return session;
  }

  async runTurn(input) {
    let attempt = 0;

    while (attempt < 2) {
      attempt += 1;
      const session = await this.bootstrapSession(input.session);

      try {
        return await this.runTurnOnSession({
          ...input,
          session
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const lostThread = /thread.*(not found|unknown)/iu.test(message);
        if (!lostThread || attempt >= 2) {
          throw error;
        }

        session.codexThreadId = null;
      }
    }

    throw new Error("Unexpected codex turn failure");
  }

  async runTurnOnSession(input) {
    const sessionThreadId = readString(input.session.codexThreadId);
    if (!sessionThreadId) {
      throw new Error("Codex session thread is unavailable");
    }

    let codexTurnId = "";
    const outputChunks = [];
    let completedStatus = "inProgress";
    let completedError = null;

    let resolveCompleted;
    let rejectCompleted;
    const completionPromise = new Promise((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    const completionTimeout = setTimeout(() => {
      rejectCompleted(
        new Error(
          `RPC_TRANSPORT_TIMEOUT: turn did not complete within ${String(codexTurnTimeoutMs)}ms`
        )
      );
    }, codexTurnTimeoutMs);

    const unsubscribe = this.rpc.subscribe((notification) => {
      const params = notification.params || {};
      const threadId = readString(params.threadId);
      const turnId = readString(params.turnId || params.turn?.id);

      if (threadId !== sessionThreadId) {
        return;
      }

      if (notification.method === "item/agentMessage/delta") {
        if (codexTurnId && turnId !== codexTurnId) {
          return;
        }

        if (!codexTurnId) {
          codexTurnId = turnId;
        }

        const delta = readString(params.delta);
        if (delta) {
          outputChunks.push(delta);
        }
        return;
      }

      if (notification.method === "item/completed") {
        if (codexTurnId && turnId !== codexTurnId) {
          return;
        }

        const item = params.item || {};
        if (item.type === "agentMessage") {
          const fullText = readString(item.text);
          if (fullText && outputChunks.length === 0) {
            outputChunks.push(fullText);
          }
        }
        return;
      }

      if (notification.method === "error") {
        if (codexTurnId && turnId !== codexTurnId) {
          return;
        }

        const errorMessage = readString(
          params.error?.message || params.error?.details || "Codex error"
        );
        completedError = errorMessage || "Codex error";
        return;
      }

      if (notification.method === "turn/completed") {
        const turn = params.turn || {};
        const turnStatus = readString(turn.status) || "completed";
        const completionTurnId = readString(turn.id || turnId);

        if (codexTurnId && completionTurnId !== codexTurnId) {
          return;
        }

        if (!codexTurnId) {
          codexTurnId = completionTurnId;
        }

        completedStatus = turnStatus;
        const turnErrorMessage = readString(turn.error?.message || "");
        if (turnErrorMessage) {
          completedError = turnErrorMessage;
        }

        resolveCompleted();
      }
    });

    try {
      const startResponse = await this.rpc.request("turn/start", {
        threadId: sessionThreadId,
        input: [
          {
            type: "text",
            text: input.text,
            text_elements: []
          }
        ]
      });

      const startedTurnId = readString(startResponse?.turn?.id);
      if (startedTurnId) {
        codexTurnId = startedTurnId;
      }

      const startedStatus = readString(startResponse?.turn?.status);
      if (startedStatus && startedStatus !== "inProgress") {
        completedStatus = startedStatus;
        const immediateError = readString(startResponse?.turn?.error?.message || "");
        if (immediateError) {
          completedError = immediateError;
        }
        resolveCompleted();
      }

      await completionPromise;
    } finally {
      clearTimeout(completionTimeout);
      unsubscribe();
    }

    if (!codexTurnId) {
      codexTurnId = input.turnId;
    }

    const outputText = outputChunks.join("");

    if (completedStatus === "failed") {
      throw new Error(completedError || "Codex turn failed");
    }

    if (completedStatus === "interrupted") {
      return {
        outputText,
        runtimeMetadata: {
          engine: "codex",
          protocol: "jsonrpc-v2",
          status: "interrupted",
          codexThreadId: sessionThreadId,
          codexTurnId,
          sessionId: input.session.sessionId,
          identifier: input.identifier,
          codexPid: this.rpc.health().pid
        }
      };
    }

    return {
      outputText,
      runtimeMetadata: {
        engine: "codex",
        protocol: "jsonrpc-v2",
        status: completedStatus,
        codexThreadId: sessionThreadId,
        codexTurnId,
        sessionId: input.session.sessionId,
        identifier: input.identifier,
        codexPid: this.rpc.health().pid
      }
    };
  }

  async interruptTurn(input) {
    const codexThreadId = readString(input?.runtimeMetadata?.codexThreadId);
    const codexTurnId = readString(input?.runtimeMetadata?.codexTurnId || input?.turnId);

    if (!codexThreadId || !codexTurnId) {
      return {
        interrupted: false,
        reason: "CODEX_TURN_METADATA_UNAVAILABLE"
      };
    }

    await this.rpc.request("turn/interrupt", {
      threadId: codexThreadId,
      turnId: codexTurnId
    });

    return {
      interrupted: true,
      codexThreadId,
      codexTurnId
    };
  }

  health() {
    return this.rpc.health();
  }

  async stop() {
    this.rpc.stop();
  }
}

const codexProcess = new CodexAppServerProcess();

async function runMockTurn(input) {
  const sleepMs = Math.max(0, Math.min(maxSleepMs, safeInteger(input.sleepMs, 0)));
  await sleep(sleepMs);

  return {
    outputText: `Mock response: ${input.text}`,
    runtimeMetadata: {
      engine: "mock",
      sleepMs,
      identifier: input.identifier,
      sessionId: input.session.sessionId
    }
  };
}

async function runTurn(input) {
  if (engine === "codex") {
    return codexProcess.runTurn(input);
  }

  return runMockTurn(input);
}

const server = createServer(async (request, response) => {
  requestCount += 1;

  const url = new URL(request.url || "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, {
      status: "ok",
      bootId,
      bootAt,
      hostname,
      pid: process.pid,
      uptimeMs: Date.now() - bootAt,
      requestCount,
      engine,
      codex: codexProcess.health()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/session/bootstrap") {
    const identifier = readIdentifier(url);
    if (!identifier) {
      json(response, 400, {
        code: "IDENTIFIER_REQUIRED",
        message: "Query param 'identifier' is required"
      });
      return;
    }

    const session = ensureSession(identifier);

    try {
      if (engine === "codex") {
        await codexProcess.bootstrapSession(session);
      }
    } catch (error) {
      json(response, 502, {
        code: "RUNTIME_BOOTSTRAP_FAILED",
        message: error instanceof Error ? error.message : "Runtime bootstrap failed"
      });
      return;
    }

    json(response, 200, {
      ok: true,
      session,
      runtime: {
        bootId,
        engine
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/turns/start") {
    const identifier = readIdentifier(url);
    if (!identifier) {
      json(response, 400, {
        code: "IDENTIFIER_REQUIRED",
        message: "Query param 'identifier' is required"
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "INVALID_REQUEST";
      if (message === "BODY_TOO_LARGE") {
        json(response, 413, {
          code: "BODY_TOO_LARGE",
          message: "Request body exceeds configured limit"
        });
      } else {
        json(response, 400, {
          code: "INVALID_JSON",
          message: "Request body must be valid JSON"
        });
      }
      return;
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const turnId =
      typeof body.turnId === "string" && body.turnId.trim() ? body.turnId.trim() : randomUUID();

    if (!text) {
      json(response, 400, {
        code: "TEXT_REQUIRED",
        message: "Body field 'text' is required"
      });
      return;
    }

    const session = ensureSession(identifier);
    session.turnCount += 1;

    const turn = {
      identifier,
      turnId,
      threadId: typeof body.threadId === "string" ? body.threadId : null,
      text,
      status: "inProgress",
      startedAt: new Date().toISOString(),
      completedAt: null,
      outputText: null,
      runtimeMetadata: {
        bootId,
        identifier,
        sessionId: session.sessionId
      }
    };

    turnStore.set(turnId, turn);

    try {
      const result = await runTurn({
        identifier,
        turnId,
        text,
        threadId: turn.threadId,
        sleepMs: body.sleepMs,
        session
      });

      turn.status = "completed";
      turn.completedAt = new Date().toISOString();
      turn.outputText = result.outputText;
      turn.runtimeMetadata = {
        ...turn.runtimeMetadata,
        ...result.runtimeMetadata,
        sessionId: session.sessionId,
        identifier
      };

      json(response, 200, {
        turnId,
        status: turn.status,
        outputText: turn.outputText,
        runtimeMetadata: turn.runtimeMetadata
      });
      return;
    } catch (error) {
      turn.status = "error";
      turn.completedAt = new Date().toISOString();

      json(response, 502, {
        code: "RUNTIME_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : "Runtime execution failed",
        turnId
      });
      return;
    }
  }

  const interruptMatch =
    request.method === "POST" ? /^\/agent\/turns\/([^/]+)\/interrupt$/u.exec(url.pathname) : null;

  if (interruptMatch) {
    const turnId = decodeURIComponent(interruptMatch[1]);
    const turn = turnStore.get(turnId);

    if (!turn) {
      json(response, 404, {
        code: "TURN_NOT_FOUND",
        message: "Turn not found"
      });
      return;
    }

    let interruptResult = {
      interrupted: false,
      reason: "NOT_REQUIRED"
    };

    if (engine === "codex") {
      try {
        interruptResult = await codexProcess.interruptTurn(turn);
      } catch (error) {
        json(response, 502, {
          code: "RUNTIME_INTERRUPT_FAILED",
          message: error instanceof Error ? error.message : "Runtime interrupt failed",
          turnId
        });
        return;
      }
    }

    if (turn.status === "inProgress") {
      turn.status = "interrupted";
      turn.completedAt = new Date().toISOString();
    }

    json(response, 200, {
      turnId,
      status: turn.status,
      completedAt: turn.completedAt,
      interrupt: interruptResult
    });
    return;
  }

  json(response, 404, {
    code: "NOT_FOUND",
    message: "Not Found"
  });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void codexProcess.stop().finally(() => {
      server.close(() => {
        process.exit(0);
      });
    });
  });
}

server.listen(port, host, () => {
  console.info(`codex-session-runtime listening on http://${host}:${port} (engine=${engine})`);
});
