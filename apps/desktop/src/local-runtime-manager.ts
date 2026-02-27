import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

export type LocalAuthMode = "chatgpt" | "apiKey";

export interface LocalAuthState {
  authenticated: boolean;
  mode: LocalAuthMode | null;
  account: {
    label: string;
  } | null;
  updatedAt: string | null;
  authUrl?: string | null;
}

export interface LocalAgentEvent {
  cursor: number;
  threadId: string;
  turnId: string;
  type: "turn.started" | "item.delta" | "turn.completed";
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LocalAuthStore {
  read(): Promise<LocalAuthState>;
  write(state: LocalAuthState): Promise<void>;
  clear(): Promise<void>;
}

interface CodexTurnResult {
  turnId: string;
  status: "completed" | "interrupted" | "failed" | "inProgress";
  outputText: string;
}

interface CodexLoginStartResult {
  authenticated: boolean;
  accountLabel: string | null;
  authUrl: string | null;
}

export interface LocalCodexClient {
  readAccount(): Promise<{ type: string | null; label: string | null }>;
  loginStart(input: { mode: LocalAuthMode; apiKey?: string }): Promise<CodexLoginStartResult>;
  startThread(input: { threadId: string }): Promise<{ codexThreadId: string }>;
  startTurn(input: {
    threadId: string;
    codexThreadId: string;
    text: string;
    onDelta: (delta: string) => void;
  }): Promise<CodexTurnResult>;
  interruptTurn(input: { codexThreadId: string; turnId: string }): Promise<void>;
}

type EventListener = (event: LocalAgentEvent) => void;

interface RpcNotification {
  method: string;
  params: Record<string, unknown>;
}

interface PendingRequest {
  method: string;
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
}

function normalizeLocalAuthState(value: unknown): LocalAuthState {
  if (!value || typeof value !== "object") {
    return {
      authenticated: false,
      mode: null,
      account: null,
      updatedAt: null,
      authUrl: null
    };
  }

  const candidate = value as {
    authenticated?: unknown;
    mode?: unknown;
    account?: unknown;
    updatedAt?: unknown;
    authUrl?: unknown;
  };

  const mode =
    typeof candidate.mode === "string" &&
    (candidate.mode === "chatgpt" || candidate.mode === "apiKey")
      ? candidate.mode
      : null;

  const accountValue = candidate.account as { label?: unknown } | null | undefined;
  const account =
    accountValue && typeof accountValue === "object" && typeof accountValue.label === "string"
      ? { label: accountValue.label }
      : null;

  return {
    authenticated: candidate.authenticated === true,
    mode,
    account,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null,
    authUrl: typeof candidate.authUrl === "string" ? candidate.authUrl : null
  };
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

class CodexRpcClient implements LocalCodexClient {
  readonly #command: string;
  readonly #args: string[];
  readonly #requestTimeoutMs: number;
  readonly #turnTimeoutMs: number;
  readonly #notificationListeners = new Set<(notification: RpcNotification) => void>();

  #child: ReturnType<typeof spawn> | null = null;
  #startPromise: Promise<void> | null = null;
  #pending = new Map<number, PendingRequest>();
  #nextId = 1;
  #buffer = "";
  #initialized = false;

  constructor() {
    this.#command = String(process.env.CODEX_APP_SERVER_COMMAND || "codex").trim() || "codex";
    this.#args = String(process.env.CODEX_APP_SERVER_ARGS || "app-server")
      .split(" ")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    this.#requestTimeoutMs = Number.parseInt(
      process.env.DESKTOP_CODEX_REQUEST_TIMEOUT_MS || "30000",
      10
    );
    this.#turnTimeoutMs = Number.parseInt(
      process.env.DESKTOP_CODEX_TURN_TIMEOUT_MS || "120000",
      10
    );
  }

  async readAccount(): Promise<{ type: string | null; label: string | null }> {
    await this.ensureStarted();
    const result = await this.request("account/read", {});
    const account = asObjectRecord(result.account);
    const type = readNonEmptyString(account?.type);
    const email = readNonEmptyString(account?.email);
    const name = readNonEmptyString(account?.name);

    return {
      type,
      label: name || email || (type ? `${type} account` : null)
    };
  }

  async loginStart(input: {
    mode: LocalAuthMode;
    apiKey?: string;
  }): Promise<CodexLoginStartResult> {
    await this.ensureStarted();

    if (input.mode === "apiKey") {
      const apiKey = readNonEmptyString(input.apiKey);
      if (!apiKey) {
        throw new Error("API key is required for apiKey login mode");
      }

      await this.request("account/login/start", {
        type: "apiKey",
        apiKey
      });

      const account = await this.readAccount();
      return {
        authenticated: Boolean(account.type),
        accountLabel: account.label || "API key account",
        authUrl: null
      };
    }

    const login = await this.request("account/login/start", {
      type: "chatgpt"
    });

    const account = await this.readAccount();
    const authUrl = readNonEmptyString(login.authUrl);

    return {
      authenticated: Boolean(account.type),
      accountLabel: account.label || "ChatGPT account",
      authUrl
    };
  }

  async startThread(input: { threadId: string }): Promise<{ codexThreadId: string }> {
    await this.ensureStarted();

    const response = await this.request("thread/start", {
      cwd: process.cwd()
    });

    const thread = asObjectRecord(response.thread);
    const codexThreadId = readNonEmptyString(thread?.id || response.threadId);
    if (!codexThreadId) {
      throw new Error(`thread/start did not return thread.id for ${input.threadId}`);
    }

    return { codexThreadId };
  }

  async startTurn(input: {
    threadId: string;
    codexThreadId: string;
    text: string;
    onDelta: (delta: string) => void;
  }): Promise<CodexTurnResult> {
    await this.ensureStarted();

    let turnId = "";
    const chunks: string[] = [];
    let status: CodexTurnResult["status"] = "inProgress";

    let resolveCompleted: ((value?: void | PromiseLike<void>) => void) | null = null;
    let rejectCompleted: ((reason?: unknown) => void) | null = null;
    const completionPromise = new Promise<void>((resolve, reject) => {
      resolveCompleted = resolve;
      rejectCompleted = reject;
    });

    const timeout = setTimeout(() => {
      if (rejectCompleted) {
        rejectCompleted(
          new Error(
            `turn/start did not complete for thread ${input.threadId} within ${this.#turnTimeoutMs}ms`
          )
        );
      }
    }, this.#turnTimeoutMs);

    const unsubscribe = this.subscribe((notification) => {
      const params = notification.params || {};
      const eventThreadId = readNonEmptyString(params.threadId);
      if (eventThreadId !== input.codexThreadId) {
        return;
      }

      const paramsTurn = asObjectRecord(params.turn);
      const eventTurnId = readNonEmptyString(params.turnId || paramsTurn?.id);
      if (turnId && eventTurnId && eventTurnId !== turnId) {
        return;
      }

      if (notification.method === "item/agentMessage/delta") {
        const delta = readNonEmptyString(params.delta);
        if (!delta) {
          return;
        }

        chunks.push(delta);
        input.onDelta(delta);
        return;
      }

      if (notification.method === "item/completed") {
        const item = (params.item || {}) as { type?: unknown; text?: unknown };
        if (item.type === "agentMessage") {
          const text = readNonEmptyString(item.text);
          if (text && chunks.length === 0) {
            chunks.push(text);
            input.onDelta(text);
          }
        }
        return;
      }

      if (notification.method === "turn/completed") {
        const completedTurn = asObjectRecord(params.turn);
        status =
          (readNonEmptyString(completedTurn?.status || params.status) as
            | CodexTurnResult["status"]
            | null) || "completed";
        if (resolveCompleted) {
          resolveCompleted();
        }
      }
    });

    try {
      let awaitCompletion = true;
      const started = await this.request("turn/start", {
        threadId: input.codexThreadId,
        input: [
          {
            type: "text",
            text: input.text,
            text_elements: []
          }
        ]
      });

      const startedTurn = asObjectRecord(started.turn);
      turnId = readNonEmptyString(startedTurn?.id) || randomUUID();
      const immediateStatus = readNonEmptyString(startedTurn?.status);
      if (immediateStatus && immediateStatus !== "inProgress") {
        status = immediateStatus as CodexTurnResult["status"];
        awaitCompletion = false;
      }

      if (awaitCompletion) {
        await completionPromise;
      }
    } finally {
      clearTimeout(timeout);
      unsubscribe();
    }

    return {
      turnId,
      status,
      outputText: chunks.join("")
    };
  }

  async interruptTurn(input: { codexThreadId: string; turnId: string }): Promise<void> {
    await this.ensureStarted();

    await this.request("turn/interrupt", {
      threadId: input.codexThreadId,
      turnId: input.turnId
    });
  }

  private subscribe(handler: (notification: RpcNotification) => void): () => void {
    this.#notificationListeners.add(handler);
    return () => {
      this.#notificationListeners.delete(handler);
    };
  }

  private async ensureStarted(): Promise<void> {
    if (this.#child && !this.#child.killed && this.#initialized) {
      return;
    }

    if (this.#startPromise) {
      await this.#startPromise;
      return;
    }

    this.#startPromise = this.startInternal();
    try {
      await this.#startPromise;
    } finally {
      this.#startPromise = null;
    }
  }

  private async startInternal(): Promise<void> {
    const child = spawn(this.#command, this.#args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });

    this.#child = child;
    this.#initialized = false;

    child.stdout.on("data", (chunk) => {
      this.handleStdout(String(chunk));
    });

    child.stderr.on("data", (chunk) => {
      const message = String(chunk);
      if (message.trim().length > 0) {
        process.stderr.write(message);
      }
    });

    child.on("exit", (code, signal) => {
      this.#child = null;
      this.#initialized = false;
      this.rejectAllPending(
        new Error(`Local Codex App Server exited (code=${String(code)}, signal=${String(signal)})`)
      );
    });

    await this.request(
      "initialize",
      {
        protocolVersion: "2",
        clientInfo: {
          name: "compass-desktop-local-runtime",
          version: "0.1.0"
        },
        capabilities: null
      },
      true
    );

    await this.notify("initialized", {}, true);
    this.#initialized = true;
  }

  private handleStdout(text: string): void {
    this.#buffer += text;

    while (true) {
      const newlineIndex = this.#buffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = this.#buffer.slice(0, newlineIndex).trim();
      this.#buffer = this.#buffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      let parsedMessage: unknown;
      try {
        parsedMessage = JSON.parse(line) as unknown;
      } catch {
        continue;
      }
      const message = asObjectRecord(parsedMessage);
      if (!message) {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        const id = Number(message.id);
        const pending = this.#pending.get(id);
        if (!pending) {
          continue;
        }

        this.#pending.delete(id);
        clearTimeout(pending.timeout);

        const error = asObjectRecord(message.error);
        const errorMessage = readNonEmptyString(error?.message);
        if (errorMessage) {
          pending.reject(new Error(errorMessage));
        } else {
          pending.resolve(asObjectRecord(message.result) || {});
        }
        continue;
      }

      const method = readNonEmptyString(message.method);
      if (method) {
        const notification: RpcNotification = {
          method,
          params: asObjectRecord(message.params) || {}
        };

        for (const listener of this.#notificationListeners) {
          listener(notification);
        }
      }
    }
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  private async notify(
    method: string,
    params: Record<string, unknown>,
    skipEnsureStarted = false
  ): Promise<void> {
    if (!skipEnsureStarted) {
      await this.ensureStarted();
    }

    const child = this.#child;
    if (!child || child.killed || !child.stdin) {
      throw new Error("Local Codex App Server is unavailable");
    }
    const stdin = child.stdin;

    await new Promise<void>((resolve, reject) => {
      stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`, "utf8", (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    skipEnsureStarted = false
  ): Promise<Record<string, unknown>> {
    if (!skipEnsureStarted) {
      await this.ensureStarted();
    }

    const child = this.#child;
    if (!child || child.killed || !child.stdin) {
      throw new Error("Local Codex App Server is unavailable");
    }
    const stdin = child.stdin;

    const id = this.#nextId++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${method} timed out after ${this.#requestTimeoutMs}ms`));
      }, this.#requestTimeoutMs);

      this.#pending.set(id, {
        method,
        resolve,
        reject,
        timeout
      });

      stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
        "utf8",
        (error) => {
          if (!error) {
            return;
          }

          const pending = this.#pending.get(id);
          if (!pending) {
            return;
          }

          this.#pending.delete(id);
          clearTimeout(timeout);
          reject(error);
        }
      );
    });
  }
}

function accountLabelForType(type: string | null): string {
  if (!type) {
    return "Local account";
  }
  return `${type} account`;
}

export class LocalRuntimeManager {
  readonly #authStore: LocalAuthStore;
  readonly #codexClient: LocalCodexClient;
  #eventCursor = 0;
  readonly #threadSessions = new Map<string, string>();
  readonly #threadCodexMap = new Map<string, string>();
  readonly #turnCodexMap = new Map<
    string,
    { threadId: string; codexThreadId: string; codexTurnId: string }
  >();
  readonly #eventListeners = new Set<EventListener>();

  constructor(input: { authStore: LocalAuthStore; codexClient?: LocalCodexClient }) {
    this.#authStore = input.authStore;
    this.#codexClient = input.codexClient ?? new CodexRpcClient();
  }

  async loginStart(input: { mode: LocalAuthMode; apiKey?: string }): Promise<LocalAuthState> {
    if (input.mode === "apiKey" && (!input.apiKey || !input.apiKey.trim())) {
      throw new Error("API key is required for apiKey login mode");
    }

    const login = await this.#codexClient.loginStart({
      mode: input.mode,
      apiKey: input.apiKey
    });

    const state: LocalAuthState = {
      authenticated: login.authenticated,
      mode: input.mode,
      account: login.accountLabel ? { label: login.accountLabel } : null,
      updatedAt: new Date().toISOString(),
      authUrl: login.authUrl
    };

    await this.#authStore.write(state);
    return state;
  }

  async loginStatus(): Promise<LocalAuthState> {
    const persisted = normalizeLocalAuthState(await this.#authStore.read());

    let account: { type: string | null; label: string | null };
    try {
      account = await this.#codexClient.readAccount();
    } catch {
      // Keep persisted state when the local runtime is unavailable.
      return persisted;
    }
    const accountType = account.type;
    const accountLabel = account.label;

    const nextState: LocalAuthState = {
      authenticated: Boolean(accountType),
      mode: persisted.mode,
      account: accountLabel ? { label: accountLabel } : persisted.account,
      updatedAt: new Date().toISOString(),
      authUrl: persisted.authUrl ?? null
    };

    if (!nextState.mode && accountType) {
      nextState.mode = accountType === "chatgpt" ? "chatgpt" : "apiKey";
      nextState.account = {
        label: accountLabel || accountLabelForType(accountType)
      };
    }

    await this.#authStore.write(nextState);
    return nextState;
  }

  async logout(): Promise<LocalAuthState> {
    await this.#authStore.clear();
    this.#threadCodexMap.clear();
    this.#turnCodexMap.clear();
    return {
      authenticated: false,
      mode: null,
      account: null,
      updatedAt: new Date().toISOString(),
      authUrl: null
    };
  }

  subscribe(handler: EventListener): () => void {
    this.#eventListeners.add(handler);
    return () => {
      this.#eventListeners.delete(handler);
    };
  }

  async startTurn(input: { threadId: string; text: string; turnId?: string }): Promise<{
    turnId: string;
    status: "completed" | "interrupted" | "failed";
    outputText: string;
    sessionId: string;
    executionMode: "local";
    executionHost: "desktop_local";
  }> {
    const auth = await this.loginStatus();
    if (!auth.authenticated) {
      throw new Error("Local runtime is not authenticated");
    }

    if (!input.threadId || !input.threadId.trim()) {
      throw new Error("threadId is required");
    }

    if (!input.text || !input.text.trim()) {
      throw new Error("text is required");
    }

    const threadId = input.threadId.trim();
    const turnId = input.turnId?.trim() || randomUUID();
    const sessionId = this.#ensureThreadSession(threadId);

    const codexThreadId = await this.#ensureCodexThread(threadId);

    this.#emitEvent({
      threadId,
      turnId,
      type: "turn.started",
      payload: {
        executionMode: "local",
        executionHost: "desktop_local"
      }
    });

    const turn = await this.#codexClient.startTurn({
      threadId,
      codexThreadId,
      text: input.text.trim(),
      onDelta: (delta) => {
        this.#emitEvent({
          threadId,
          turnId,
          type: "item.delta",
          payload: {
            role: "assistant",
            text: delta
          }
        });
      }
    });
    if (turn.status === "inProgress") {
      throw new Error("Local runtime returned non-terminal turn status");
    }

    this.#turnCodexMap.set(turnId, {
      threadId,
      codexThreadId,
      codexTurnId: turn.turnId
    });

    this.#emitEvent({
      threadId,
      turnId,
      type: "turn.completed",
      payload: {
        status: turn.status
      }
    });

    return {
      turnId,
      status: turn.status,
      outputText: turn.outputText,
      sessionId,
      executionMode: "local",
      executionHost: "desktop_local"
    };
  }

  async interruptTurn(input: {
    turnId: string;
  }): Promise<{ turnId: string; status: "interrupted" }> {
    if (!input.turnId || !input.turnId.trim()) {
      throw new Error("turnId is required");
    }

    const turnId = input.turnId.trim();
    const mapped = this.#turnCodexMap.get(turnId);
    if (mapped) {
      await this.#codexClient.interruptTurn({
        codexThreadId: mapped.codexThreadId,
        turnId: mapped.codexTurnId
      });
    }

    return {
      turnId,
      status: "interrupted"
    };
  }

  async readLoginAuthUrl(): Promise<string | null> {
    const state = normalizeLocalAuthState(await this.#authStore.read());
    return state.authUrl || null;
  }

  async #ensureCodexThread(threadId: string): Promise<string> {
    const existing = this.#threadCodexMap.get(threadId);
    if (existing) {
      return existing;
    }

    const created = await this.#codexClient.startThread({ threadId });
    this.#threadCodexMap.set(threadId, created.codexThreadId);
    return created.codexThreadId;
  }

  #ensureThreadSession(threadId: string): string {
    const existing = this.#threadSessions.get(threadId);
    if (existing) {
      return existing;
    }

    const next = randomUUID();
    this.#threadSessions.set(threadId, next);
    return next;
  }

  #emitEvent(input: {
    threadId: string;
    turnId: string;
    type: LocalAgentEvent["type"];
    payload: Record<string, unknown>;
  }): void {
    const event: LocalAgentEvent = {
      cursor: ++this.#eventCursor,
      threadId: input.threadId,
      turnId: input.turnId,
      type: input.type,
      payload: input.payload,
      createdAt: new Date().toISOString()
    };

    for (const listener of this.#eventListeners) {
      listener(event);
    }
  }
}
