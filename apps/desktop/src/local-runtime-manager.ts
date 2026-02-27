import { randomUUID } from "node:crypto";
import type {
  RuntimeAccountLoginCancelResponse,
  RuntimeAccountLoginStartResponse,
  RuntimeAccountLogoutResponse,
  RuntimeAccountRateLimitsReadResponse,
  RuntimeAccountReadResponse
} from "@compass/contracts" with { "resolution-mode": "import" };

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

export interface LocalRuntimeNotification {
  method:
    | "account/login/completed"
    | "account/updated"
    | "account/rateLimits/updated"
    | "mcpServer/oauthLogin/completed";
  params: Record<string, unknown>;
  createdAt: string;
}
export type LocalRuntimeRateLimits = RuntimeAccountRateLimitsReadResponse;

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
  loginId?: string | null;
}

interface SharedCodexRuntimeClient {
  readAccount(): Promise<{ type: string | null; label: string | null }>;
  loginStart(input: { mode: LocalAuthMode; apiKey?: string }): Promise<{
    authenticated: boolean;
    accountLabel: string | null;
    authUrl: string | null;
    loginId?: string | null;
  }>;
  loginCancel(input: { loginId: string }): Promise<unknown>;
  logout(): Promise<{ authenticated: boolean; accountLabel: string | null; mode: string | null }>;
  readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse>;
  subscribe(
    listener: (notification: { method: string; params: Record<string, unknown> }) => void
  ): () => void;
  startThread(input?: { cwd?: string }): Promise<{ threadId: string }>;
  runTurn(input: { threadId: string; text: string; onDelta: (delta: string) => void }): Promise<{
    turnId: string;
    status: "completed" | "interrupted" | "failed" | "inProgress";
    outputText: string;
  }>;
  interruptTurn(input: { threadId: string; turnId: string }): Promise<{
    interrupted: boolean;
    reason?: string;
    threadId?: string;
    turnId?: string;
  }>;
}

export interface LocalCodexClient {
  readAccount(): Promise<{ type: string | null; label: string | null }>;
  loginStart(input: { mode: LocalAuthMode; apiKey?: string }): Promise<CodexLoginStartResult>;
  loginCancel(input: { loginId: string }): Promise<void>;
  logout(): Promise<void>;
  readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse>;
  subscribeNotifications(
    listener: (notification: { method: string; params: Record<string, unknown> }) => void
  ): Promise<() => void>;
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
type RuntimeNotificationListener = (notification: LocalRuntimeNotification) => void;

const LOCAL_RUNTIME_CAPABILITIES = {
  interactiveAuth: true,
  supportsChatgptManaged: true,
  supportsApiKey: true,
  supportsChatgptAuthTokens: true,
  supportsRateLimits: true,
  supportsRuntimeStream: true
};

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

function accountLabelForType(type: string | null): string {
  if (!type) {
    return "Local account";
  }
  return `${type} account`;
}

function toRuntimeAccountState(authState: LocalAuthState): RuntimeAccountReadResponse {
  const authMode =
    authState.mode === "chatgpt" ? "chatgpt" : authState.mode === "apiKey" ? "apikey" : null;

  return {
    provider: "local_process",
    capabilities: LOCAL_RUNTIME_CAPABILITIES,
    authMode,
    requiresOpenaiAuth: true,
    account: authState.account
      ? {
          type: authState.mode ?? "local",
          label: authState.account.label
        }
      : null
  };
}

let codexClientCtorPromise: Promise<
  new (input: {
    command: string;
    args: string;
    requestTimeoutMs: number;
    turnTimeoutMs: number;
    initTimeoutMs: number;
    maxRestarts: number;
  }) => SharedCodexRuntimeClient
> | null = null;

async function loadCodexClientCtor(): Promise<
  new (input: {
    command: string;
    args: string;
    requestTimeoutMs: number;
    turnTimeoutMs: number;
    initTimeoutMs: number;
    maxRestarts: number;
  }) => SharedCodexRuntimeClient
> {
  if (!codexClientCtorPromise) {
    codexClientCtorPromise = import("@compass/codex-runtime-core").then((module) => {
      return module.CodexJsonRpcClient as new (input: {
        command: string;
        args: string;
        requestTimeoutMs: number;
        turnTimeoutMs: number;
        initTimeoutMs: number;
        maxRestarts: number;
      }) => SharedCodexRuntimeClient;
    });
  }

  return codexClientCtorPromise;
}

class SharedCodexClientAdapter implements LocalCodexClient {
  readonly #client: Promise<SharedCodexRuntimeClient>;

  constructor() {
    this.#client = this.#createClient();
  }

  async #createClient(): Promise<SharedCodexRuntimeClient> {
    const CodexClient = await loadCodexClientCtor();
    return new CodexClient({
      command: String(process.env.CODEX_APP_SERVER_COMMAND || "codex").trim() || "codex",
      args: String(process.env.CODEX_APP_SERVER_ARGS || "app-server"),
      requestTimeoutMs: Number.parseInt(
        process.env.DESKTOP_CODEX_REQUEST_TIMEOUT_MS || "30000",
        10
      ),
      turnTimeoutMs: Number.parseInt(process.env.DESKTOP_CODEX_TURN_TIMEOUT_MS || "120000", 10),
      initTimeoutMs: Number.parseInt(process.env.DESKTOP_CODEX_INIT_TIMEOUT_MS || "30000", 10),
      maxRestarts: Number.parseInt(process.env.DESKTOP_CODEX_MAX_RESTARTS || "2", 10)
    });
  }

  async #getClient(): Promise<SharedCodexRuntimeClient> {
    return this.#client;
  }

  async readAccount(): Promise<{ type: string | null; label: string | null }> {
    const client = await this.#getClient();
    const account = await client.readAccount();
    return {
      type: account.type,
      label: account.label
    };
  }

  async loginStart(input: {
    mode: LocalAuthMode;
    apiKey?: string;
  }): Promise<CodexLoginStartResult> {
    const client = await this.#getClient();
    const result = await client.loginStart(input);
    return {
      authenticated: result.authenticated,
      accountLabel: result.accountLabel,
      authUrl: result.authUrl,
      loginId: result.loginId ?? null
    };
  }

  async loginCancel(input: { loginId: string }): Promise<void> {
    const client = await this.#getClient();
    await client.loginCancel({
      loginId: input.loginId
    });
  }

  async logout(): Promise<void> {
    const client = await this.#getClient();
    await client.logout();
  }

  async readRateLimits(): Promise<LocalRuntimeRateLimits> {
    const client = await this.#getClient();
    return await client.readRateLimits();
  }

  async subscribeNotifications(
    listener: (notification: { method: string; params: Record<string, unknown> }) => void
  ): Promise<() => void> {
    const client = await this.#getClient();
    return client.subscribe(listener);
  }

  async startThread(_input: { threadId: string }): Promise<{ codexThreadId: string }> {
    const client = await this.#getClient();
    const started = await client.startThread({
      cwd: process.cwd()
    });

    return {
      codexThreadId: started.threadId
    };
  }

  async startTurn(input: {
    threadId: string;
    codexThreadId: string;
    text: string;
    onDelta: (delta: string) => void;
  }): Promise<CodexTurnResult> {
    const client = await this.#getClient();
    const result = await client.runTurn({
      threadId: input.codexThreadId,
      text: input.text,
      onDelta: input.onDelta
    });

    return {
      turnId: result.turnId || randomUUID(),
      status:
        result.status === "failed" ||
        result.status === "interrupted" ||
        result.status === "completed" ||
        result.status === "inProgress"
          ? result.status
          : "failed",
      outputText: result.outputText
    };
  }

  async interruptTurn(input: { codexThreadId: string; turnId: string }): Promise<void> {
    const client = await this.#getClient();
    await client.interruptTurn({
      threadId: input.codexThreadId,
      turnId: input.turnId
    });
  }
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
  readonly #runtimeNotificationListeners = new Set<RuntimeNotificationListener>();

  constructor(input: { authStore: LocalAuthStore; codexClient?: LocalCodexClient }) {
    this.#authStore = input.authStore;
    this.#codexClient = input.codexClient ?? new SharedCodexClientAdapter();

    void this.#codexClient
      .subscribeNotifications((notification) => {
        if (
          notification.method !== "account/login/completed" &&
          notification.method !== "account/updated" &&
          notification.method !== "account/rateLimits/updated" &&
          notification.method !== "mcpServer/oauthLogin/completed"
        ) {
          return;
        }

        const runtimeNotification: LocalRuntimeNotification = {
          method: notification.method,
          params: notification.params ?? {},
          createdAt: new Date().toISOString()
        };
        for (const listener of this.#runtimeNotificationListeners) {
          listener(runtimeNotification);
        }
      })
      .catch(() => {
        // Best-effort subscription; runtime notifications are optional.
      });
  }

  async loginStart(input: {
    mode: LocalAuthMode;
    apiKey?: string;
  }): Promise<RuntimeAccountLoginStartResponse> {
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
    return {
      type: input.mode,
      loginId: login.loginId ?? null,
      authUrl: login.authUrl ?? null
    };
  }

  async loginCancel(input: { loginId: string }): Promise<RuntimeAccountLoginCancelResponse> {
    if (!input.loginId || !input.loginId.trim()) {
      throw new Error("loginId is required");
    }

    await this.#codexClient.loginCancel({
      loginId: input.loginId.trim()
    });

    return { status: "canceled" };
  }

  async loginStatus(): Promise<RuntimeAccountReadResponse> {
    const persisted = normalizeLocalAuthState(await this.#authStore.read());

    let account: { type: string | null; label: string | null };
    try {
      account = await this.#codexClient.readAccount();
    } catch {
      // Keep persisted state when local runtime process is unavailable.
      return toRuntimeAccountState(persisted);
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
    return toRuntimeAccountState(nextState);
  }

  async logout(): Promise<RuntimeAccountLogoutResponse> {
    try {
      await this.#codexClient.logout();
    } catch {
      // local logout is best effort; local cache clear remains authoritative.
    }

    await this.#authStore.clear();
    this.#threadCodexMap.clear();
    this.#turnCodexMap.clear();

    return {};
  }

  async readRateLimits(): Promise<LocalRuntimeRateLimits> {
    return await this.#codexClient.readRateLimits();
  }

  subscribe(handler: EventListener): () => void {
    this.#eventListeners.add(handler);
    return () => {
      this.#eventListeners.delete(handler);
    };
  }

  subscribeRuntimeNotifications(handler: RuntimeNotificationListener): () => void {
    this.#runtimeNotificationListeners.add(handler);
    return () => {
      this.#runtimeNotificationListeners.delete(handler);
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
    const authState: unknown = await this.loginStatus();
    const authMode =
      authState && typeof authState === "object" && "authMode" in authState
        ? (authState as { authMode?: unknown }).authMode
        : null;
    if (typeof authMode !== "string" || authMode.trim().length === 0) {
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
