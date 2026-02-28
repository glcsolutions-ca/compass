import { spawn } from "node:child_process";

function readNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readTextChunk(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value;
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function readBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function parseRpcError(method, errorPayload) {
  const code = Number(asRecord(errorPayload)?.code ?? -32000);
  const message = readNonEmptyString(asRecord(errorPayload)?.message) || "RPC request failed";
  const error = new Error(`RPC ${method} failed (${String(code)}): ${message}`);
  error.name = "RpcRequestError";
  error.code = code;
  error.rpcMethod = method;
  return error;
}

function isRecoverableTransportError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /RPC_TRANSPORT_(DISCONNECTED|WRITE_FAILED|STARTUP_FAILED|TIMEOUT)/u.test(message);
}

function normalizeAuthMode(value) {
  if (value === "apikey" || value === "chatgpt" || value === "chatgptAuthTokens") {
    return value;
  }

  return null;
}

function normalizeAccountType(value, fallbackAuthMode) {
  if (value === "apiKey" || value === "chatgpt") {
    return value;
  }

  if (fallbackAuthMode === "apikey") {
    return "apiKey";
  }

  if (fallbackAuthMode === "chatgpt" || fallbackAuthMode === "chatgptAuthTokens") {
    return "chatgpt";
  }

  return null;
}

function normalizeRateLimitWindow(input) {
  const windowRecord = asRecord(input);
  if (!windowRecord) {
    return null;
  }

  const usedPercent = readNumber(windowRecord.usedPercent, null);
  const windowDurationMins = readNumber(windowRecord.windowDurationMins, null);
  const resetsAt = readNumber(windowRecord.resetsAt, null);

  return {
    usedPercent: usedPercent ?? 0,
    windowDurationMins,
    resetsAt
  };
}

function normalizeRateLimitSnapshot(input) {
  const snapshot = asRecord(input);
  if (!snapshot) {
    return null;
  }

  return {
    limitId: readNonEmptyString(snapshot.limitId),
    limitName: readNonEmptyString(snapshot.limitName),
    primary: normalizeRateLimitWindow(snapshot.primary),
    secondary: normalizeRateLimitWindow(snapshot.secondary),
    credits: snapshot.credits ?? null,
    planType: readNonEmptyString(snapshot.planType)
  };
}

function buildRuntimeAccountState(input) {
  const result = asRecord(input) || {};
  const account = asRecord(result.account);
  const notificationAuthMode = normalizeAuthMode(result.authMode);
  const accountType = normalizeAccountType(readNonEmptyString(account?.type), notificationAuthMode);
  const email = readNonEmptyString(account?.email);
  const name = readNonEmptyString(account?.name);
  const planType = readNonEmptyString(account?.planType);
  const label =
    name ||
    email ||
    (accountType === "apiKey" ? "API key account" : accountType ? "ChatGPT account" : null);

  return {
    authMode:
      notificationAuthMode ??
      (accountType === "apiKey" ? "apikey" : accountType === "chatgpt" ? "chatgpt" : null),
    requiresOpenaiAuth: readBoolean(result.requiresOpenaiAuth),
    account: {
      type: accountType,
      email,
      name,
      planType,
      label,
      raw: account || null
    }
  };
}

function parseJsonRpcMessage(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const message = raw;
  const hasId = Object.prototype.hasOwnProperty.call(message, "id");
  const hasMethod = typeof message.method === "string";

  if (hasId && hasMethod) {
    return {
      kind: "serverRequest",
      id: message.id,
      method: message.method,
      params: asRecord(message.params) || {}
    };
  }

  if (hasId) {
    return {
      kind: "response",
      id: message.id,
      result: asRecord(message.result) || {},
      error: message.error
    };
  }

  if (hasMethod) {
    return {
      kind: "notification",
      method: message.method,
      params: asRecord(message.params) || {}
    };
  }

  return null;
}

export class CodexJsonRpcClient {
  constructor(options = {}) {
    this.command = String(options.command || "codex").trim() || "codex";
    this.args = Array.isArray(options.args)
      ? options.args.map((part) => String(part || "").trim()).filter(Boolean)
      : String(options.args || "app-server")
          .split(" ")
          .map((part) => part.trim())
          .filter(Boolean);
    this.requestTimeoutMs = Number.isInteger(options.requestTimeoutMs)
      ? options.requestTimeoutMs
      : 30_000;
    this.turnTimeoutMs = Number.isInteger(options.turnTimeoutMs) ? options.turnTimeoutMs : 120_000;
    this.initTimeoutMs = Number.isInteger(options.initTimeoutMs) ? options.initTimeoutMs : 30_000;
    this.maxRestarts = Number.isInteger(options.maxRestarts) ? options.maxRestarts : 2;
    this.cwd = options.cwd;
    this.autoLoginApiKey = readNonEmptyString(options.autoLoginApiKey);
    this.onStderr = typeof options.onStderr === "function" ? options.onStderr : null;
    this.onChatgptAuthTokensRefresh =
      typeof options.onChatgptAuthTokensRefresh === "function"
        ? options.onChatgptAuthTokensRefresh
        : null;

    this.child = null;
    this.nextId = 1;
    this.startPromise = null;
    this.pending = new Map();
    this.notificationListeners = new Set();
    this.serverRequestHandlers = new Set();
    this.buffer = "";
    this.stderrTail = [];
    this.initialized = false;
    this.restartCount = 0;
    this.lastError = "";
    this.readyAt = null;
    this.lastAuthMode = null;
    this.lastRateLimits = null;
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
      env: process.env,
      cwd: this.cwd
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

      if (this.onStderr) {
        this.onStderr(text);
      }
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
      if (this.onStderr) {
        this.onStderr(`${message}\n`);
      }
    });

    try {
      await this.requestRaw(
        "initialize",
        {
          protocolVersion: "2",
          clientInfo: {
            name: "compass-codex-runtime-core",
            version: "0.2.1"
          },
          capabilities: null
        },
        this.initTimeoutMs,
        true
      );

      await this.notify("initialized", {}, true);

      // Mark initialized before auth bootstrap to avoid re-entrant
      // ensureStarted() waits from auth calls during startup.
      this.initialized = true;

      if (this.autoLoginApiKey) {
        await this.ensureAccountAuth(this.autoLoginApiKey);
      }

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

      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      const message = parseJsonRpcMessage(parsed);
      if (!message) {
        continue;
      }

      if (message.kind === "serverRequest") {
        void this.handleServerRequest(message);
        continue;
      }

      if (message.kind === "response") {
        const pending = this.pending.get(String(message.id));
        if (!pending) {
          continue;
        }

        this.pending.delete(String(message.id));
        clearTimeout(pending.timeout);

        if (message.error) {
          pending.reject(parseRpcError(pending.method, message.error));
          continue;
        }

        pending.resolve(message.result);
        continue;
      }

      this.handleNotification(message);
    }
  }

  handleNotification(notification) {
    if (notification.method === "account/updated") {
      this.lastAuthMode = normalizeAuthMode(notification.params.authMode);
    } else if (notification.method === "account/rateLimits/updated") {
      this.lastRateLimits = normalizeRateLimitSnapshot(notification.params.rateLimits);
    }

    for (const listener of this.notificationListeners) {
      listener({
        method: notification.method,
        params: notification.params
      });
    }
  }

  async handleServerRequest(request) {
    const responsePayload = {
      jsonrpc: "2.0",
      id: request.id
    };

    try {
      const result = await this.resolveServerRequest(request);
      responsePayload.result = result ?? {};
    } catch (error) {
      responsePayload.error = {
        code: -32000,
        message: error instanceof Error ? error.message : "Server request handling failed"
      };
    }

    await this.writeRawMessage(responsePayload).catch(() => {});
  }

  async resolveServerRequest(request) {
    if (request.method === "account/chatgptAuthTokens/refresh" && this.onChatgptAuthTokensRefresh) {
      return await this.onChatgptAuthTokensRefresh(request.params);
    }

    for (const handler of this.serverRequestHandlers) {
      const result = await handler(request);
      if (result !== undefined) {
        return result;
      }
    }

    throw new Error(`Unhandled server request: ${request.method}`);
  }

  async writeRawMessage(payload) {
    const child = this.child;
    if (!child || child.killed || !child.stdin) {
      throw new Error("RPC_TRANSPORT_DISCONNECTED: app server process is unavailable");
    }

    return new Promise((resolve, reject) => {
      child.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (error) {
          reject(new Error(`RPC_TRANSPORT_WRITE_FAILED: ${error.message}`));
          return;
        }
        resolve();
      });
    });
  }

  rejectAllPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }

    this.pending.clear();
  }

  async request(method, params, timeoutMs = this.requestTimeoutMs) {
    return this.requestWithRestart(method, params, timeoutMs);
  }

  async requestWithRestart(method, params, timeoutMs = this.requestTimeoutMs) {
    let attempt = 0;

    while (true) {
      try {
        await this.ensureStarted();
        return await this.requestRaw(method, params, timeoutMs, true);
      } catch (error) {
        if (attempt >= this.maxRestarts || !isRecoverableTransportError(error)) {
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
    const idKey = String(id);

    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {}
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(idKey);
        reject(
          new Error(`RPC_TRANSPORT_TIMEOUT: ${method} timed out after ${String(timeoutMs)}ms`)
        );
      }, timeoutMs);

      this.pending.set(idKey, {
        method,
        resolve,
        reject,
        timeout
      });

      child.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }

        const pending = this.pending.get(idKey);
        if (!pending) {
          return;
        }

        this.pending.delete(idKey);
        clearTimeout(timeout);
        reject(new Error(`RPC_TRANSPORT_WRITE_FAILED: ${error.message}`));
      });
    });
  }

  async notify(method, params, skipEnsureStarted = false) {
    if (!skipEnsureStarted) {
      await this.ensureStarted();
    }

    await this.writeRawMessage({ jsonrpc: "2.0", method, params: params ?? {} });
  }

  subscribe(listener) {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  onServerRequest(handler) {
    this.serverRequestHandlers.add(handler);
    return () => {
      this.serverRequestHandlers.delete(handler);
    };
  }

  async ensureAccountAuth(apiKey) {
    const accountState = await this.readAccountState({
      refreshToken: false
    });

    if (accountState.account.type) {
      return;
    }

    await this.loginStartAccount({
      mode: "apiKey",
      apiKey
    });

    const postLogin = await this.readAccountState({
      refreshToken: false
    });
    if (!postLogin.account.type) {
      throw new Error("RPC account/login/start did not produce an authenticated account state");
    }
  }

  async readAccountState(input = {}) {
    const result = await this.request("account/read", {
      refreshToken: readBoolean(input.refreshToken)
    });
    const state = buildRuntimeAccountState({
      ...result,
      authMode: this.lastAuthMode
    });

    if (state.authMode) {
      this.lastAuthMode = state.authMode;
    }

    return state;
  }

  async readRateLimits() {
    const result = asRecord(await this.request("account/rateLimits/read", {})) || {};
    const snapshot = normalizeRateLimitSnapshot(result.rateLimits);
    const byLimitIdRecord = asRecord(result.rateLimitsByLimitId);
    const byLimitId = {};

    if (byLimitIdRecord) {
      for (const [key, value] of Object.entries(byLimitIdRecord)) {
        byLimitId[key] = normalizeRateLimitSnapshot(value);
      }
    }

    const normalized = {
      rateLimits: snapshot,
      rateLimitsByLimitId: Object.keys(byLimitId).length > 0 ? byLimitId : null
    };
    this.lastRateLimits = snapshot;
    return normalized;
  }

  async loginStartAccount(input) {
    const mode = input?.mode;
    if (mode !== "apiKey" && mode !== "chatgpt" && mode !== "chatgptAuthTokens") {
      throw new Error("Unsupported login mode");
    }

    if (mode === "apiKey") {
      const apiKey = readNonEmptyString(input?.apiKey);
      if (!apiKey) {
        throw new Error("API key is required for apiKey login mode");
      }

      const result = await this.request("account/login/start", {
        type: "apiKey",
        apiKey
      });

      return {
        type: "apiKey",
        loginId: null,
        authUrl: readNonEmptyString(result.authUrl)
      };
    }

    if (mode === "chatgptAuthTokens") {
      const accessToken = readNonEmptyString(input?.accessToken);
      const chatgptAccountId = readNonEmptyString(input?.chatgptAccountId);
      if (!accessToken || !chatgptAccountId) {
        throw new Error("accessToken and chatgptAccountId are required for chatgptAuthTokens mode");
      }

      await this.request("account/login/start", {
        type: "chatgptAuthTokens",
        accessToken,
        chatgptAccountId,
        chatgptPlanType: readNonEmptyString(input?.chatgptPlanType)
      });

      return {
        type: "chatgptAuthTokens",
        loginId: null,
        authUrl: null
      };
    }

    const login = asRecord(
      await this.request("account/login/start", {
        type: "chatgpt"
      })
    );

    return {
      type: "chatgpt",
      loginId: readNonEmptyString(login?.loginId),
      authUrl: readNonEmptyString(login?.authUrl)
    };
  }

  async loginCancel(input) {
    const loginId = readNonEmptyString(input?.loginId);
    if (!loginId) {
      throw new Error("loginId is required");
    }

    return await this.request("account/login/cancel", {
      loginId
    });
  }

  async logoutAccount() {
    try {
      await this.request("account/logout", {});
    } catch {
      // Best effort: some runtimes may not implement account/logout.
    }

    return await this.readAccountState({
      refreshToken: false
    });
  }

  async readAccount() {
    const state = await this.readAccountState({
      refreshToken: false
    });

    return {
      type: state.account.type,
      email: state.account.email,
      name: state.account.name,
      label: state.account.label
    };
  }

  async loginStart(input) {
    const mode =
      input?.mode === "chatgpt"
        ? "chatgpt"
        : input?.mode === "chatgptAuthTokens"
          ? "chatgptAuthTokens"
          : "apiKey";

    const login = await this.loginStartAccount({
      mode,
      apiKey: input?.apiKey,
      accessToken: input?.accessToken,
      chatgptAccountId: input?.chatgptAccountId,
      chatgptPlanType: input?.chatgptPlanType
    });
    const account = await this.readAccount();

    return {
      authenticated: Boolean(account.type),
      accountLabel:
        account.label || (login.type === "chatgpt" ? "ChatGPT account" : "API key account"),
      authUrl: login.authUrl,
      loginId: login.loginId,
      mode: account.type
    };
  }

  async logout() {
    const state = await this.logoutAccount();
    return {
      authenticated: Boolean(state.account.type),
      accountLabel: state.account.label,
      mode: state.account.type
    };
  }

  async startThread(input = {}) {
    const response = await this.request("thread/start", {
      cwd: input.cwd || process.cwd()
    });

    const thread = asRecord(response.thread) || {};
    const threadId = readNonEmptyString(thread.id || response.threadId);
    if (!threadId) {
      throw new Error("thread/start did not return thread.id");
    }

    return {
      threadId
    };
  }

  async runTurn(input) {
    const threadId = readNonEmptyString(input?.threadId);
    const text = typeof input?.text === "string" ? input.text : "";
    if (!threadId) {
      throw new Error("threadId is required");
    }
    if (!text.trim()) {
      throw new Error("text is required");
    }

    let resolvedTurnId = "";
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
          `RPC_TRANSPORT_TIMEOUT: turn did not complete within ${String(this.turnTimeoutMs)}ms`
        )
      );
    }, this.turnTimeoutMs);

    const unsubscribe = this.subscribe((notification) => {
      const params = notification.params || {};
      const notificationThreadId = readNonEmptyString(params.threadId);
      const notificationTurnRecord = asRecord(params.turn) || {};
      const notificationTurnId = readNonEmptyString(params.turnId || notificationTurnRecord.id);

      if (notificationThreadId !== threadId) {
        return;
      }

      if (notification.method === "item/agentMessage/delta") {
        if (resolvedTurnId && notificationTurnId !== resolvedTurnId) {
          return;
        }

        if (!resolvedTurnId && notificationTurnId) {
          resolvedTurnId = notificationTurnId;
        }

        const delta = readTextChunk(params.delta);
        if (delta.length > 0) {
          outputChunks.push(delta);
          if (typeof input.onDelta === "function") {
            input.onDelta(delta);
          }
        }

        return;
      }

      if (notification.method === "item/completed") {
        if (resolvedTurnId && notificationTurnId !== resolvedTurnId) {
          return;
        }

        const item = asRecord(params.item) || {};
        if (item.type === "agentMessage") {
          const fullText = readTextChunk(item.text);
          if (fullText.length > 0 && outputChunks.length === 0) {
            outputChunks.push(fullText);
            if (typeof input.onDelta === "function") {
              input.onDelta(fullText);
            }
          }
        }

        return;
      }

      if (notification.method === "error") {
        if (resolvedTurnId && notificationTurnId !== resolvedTurnId) {
          return;
        }

        completedError =
          readNonEmptyString(asRecord(params.error)?.message) ||
          readNonEmptyString(asRecord(params.error)?.details) ||
          "Codex error";
        return;
      }

      if (notification.method === "turn/completed") {
        const turn = asRecord(params.turn) || {};
        const turnStatus = readNonEmptyString(turn.status) || "completed";
        const completionTurnId = readNonEmptyString(turn.id || notificationTurnId);

        if (resolvedTurnId && completionTurnId !== resolvedTurnId) {
          return;
        }

        if (!resolvedTurnId && completionTurnId) {
          resolvedTurnId = completionTurnId;
        }

        completedStatus = turnStatus;

        const turnErrorMessage = readNonEmptyString(asRecord(turn.error)?.message);
        if (turnErrorMessage) {
          completedError = turnErrorMessage;
        }

        resolveCompleted();
      }
    });

    try {
      const startResponse = await this.request("turn/start", {
        threadId,
        input: [
          {
            type: "text",
            text,
            text_elements: []
          }
        ]
      });

      const startedTurn = asRecord(startResponse.turn) || {};
      const startedTurnId = readNonEmptyString(startedTurn.id);
      if (startedTurnId) {
        resolvedTurnId = startedTurnId;
      }

      const startedStatus = readNonEmptyString(startedTurn.status);
      if (startedStatus && startedStatus !== "inProgress") {
        completedStatus = startedStatus;
        const immediateError = readNonEmptyString(asRecord(startedTurn.error)?.message);
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

    const turnId = resolvedTurnId || readNonEmptyString(input?.turnId) || "";
    const outputText = outputChunks.join("");

    return {
      turnId,
      status: completedStatus,
      outputText,
      errorMessage: completedError
    };
  }

  async interruptTurn(input) {
    const threadId = readNonEmptyString(input?.threadId);
    const turnId = readNonEmptyString(input?.turnId);

    if (!threadId || !turnId) {
      return {
        interrupted: false,
        reason: "CODEX_TURN_METADATA_UNAVAILABLE"
      };
    }

    await this.request("turn/interrupt", {
      threadId,
      turnId
    });

    return {
      interrupted: true,
      threadId,
      turnId
    };
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
      stderrTail: this.stderrTail.slice(-10),
      lastAuthMode: this.lastAuthMode,
      lastRateLimits: this.lastRateLimits
    };
  }

  async stop() {
    await this.forceRestart();
  }
}
