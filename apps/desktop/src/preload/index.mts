import { contextBridge, ipcRenderer } from "electron";

class DesktopBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DesktopBridgeError";
  }
}

type DesktopAuthMode = "apikey" | "chatgpt" | "chatgptAuthTokens";
type DesktopRuntimeProvider = "dynamic_sessions" | "local_process" | "local_docker" | "mock";

interface RuntimeCapabilities {
  interactiveAuth: boolean;
  supportsChatgptManaged: boolean;
  supportsApiKey: boolean;
  supportsChatgptAuthTokens: boolean;
  supportsRateLimits: boolean;
  supportsRuntimeStream: boolean;
}

interface RuntimeAccountReadResponse {
  provider: DesktopRuntimeProvider;
  capabilities: RuntimeCapabilities;
  authMode: DesktopAuthMode | null;
  requiresOpenaiAuth: boolean;
  account: Record<string, unknown> | null;
}

type RuntimeAccountLoginStartRequest = { type: "chatgpt" } | { type: "apiKey"; apiKey: string };

interface RuntimeAccountLoginStartResponse {
  type: "chatgpt" | "apiKey" | "chatgptAuthTokens";
  loginId?: string | null;
  authUrl?: string | null;
}

type RuntimeAccountLoginCancelRequest = { loginId: string };
type RuntimeAccountLoginCancelResponse = Record<string, unknown>;
type RuntimeAccountLogoutResponse = Record<string, never>;

interface RuntimeRateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

interface RuntimeRateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  primary: RuntimeRateLimitWindow | null;
  secondary: RuntimeRateLimitWindow | null;
  credits?: unknown;
  planType?: string | null;
}

interface RuntimeAccountRateLimitsReadResponse {
  rateLimits: RuntimeRateLimitSnapshot | null;
  rateLimitsByLimitId: Record<string, RuntimeRateLimitSnapshot | null> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function requireBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function requireNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : value === null
      ? null
      : null;
}

function parseRuntimeAccountReadResponse(payload: unknown): RuntimeAccountReadResponse {
  const record = asRecord(payload);
  if (!record) {
    throw new DesktopBridgeError("INVALID_RESPONSE", "Runtime account state payload is invalid.");
  }

  const capabilities = asRecord(record.capabilities);
  if (!capabilities) {
    throw new DesktopBridgeError("INVALID_RESPONSE", "Runtime capabilities payload is invalid.");
  }

  return {
    provider:
      record.provider === "dynamic_sessions" ||
      record.provider === "local_process" ||
      record.provider === "local_docker" ||
      record.provider === "mock"
        ? record.provider
        : "mock",
    capabilities: {
      interactiveAuth: requireBoolean(capabilities.interactiveAuth),
      supportsChatgptManaged: requireBoolean(capabilities.supportsChatgptManaged),
      supportsApiKey: requireBoolean(capabilities.supportsApiKey),
      supportsChatgptAuthTokens: requireBoolean(capabilities.supportsChatgptAuthTokens),
      supportsRateLimits: requireBoolean(capabilities.supportsRateLimits),
      supportsRuntimeStream: requireBoolean(capabilities.supportsRuntimeStream)
    },
    authMode:
      record.authMode === "apikey" ||
      record.authMode === "chatgpt" ||
      record.authMode === "chatgptAuthTokens"
        ? record.authMode
        : null,
    requiresOpenaiAuth: requireBoolean(record.requiresOpenaiAuth),
    account: asRecord(record.account) ?? null
  };
}

function parseRuntimeAccountLoginStartResponse(payload: unknown): RuntimeAccountLoginStartResponse {
  const record = asRecord(payload);
  if (!record) {
    throw new DesktopBridgeError("INVALID_RESPONSE", "Runtime login payload is invalid.");
  }

  return {
    type:
      record.type === "chatgpt" || record.type === "apiKey" || record.type === "chatgptAuthTokens"
        ? record.type
        : "chatgpt",
    loginId: requireNullableString(record.loginId),
    authUrl: requireNullableString(record.authUrl)
  };
}

function parseRuntimeAccountLoginCancelResponse(
  payload: unknown
): RuntimeAccountLoginCancelResponse {
  return asRecord(payload) ?? {};
}

function parseRuntimeAccountLogoutResponse(payload: unknown): RuntimeAccountLogoutResponse {
  if (payload === null || payload === undefined) {
    return {};
  }

  const record = asRecord(payload);
  if (!record) {
    throw new DesktopBridgeError("INVALID_RESPONSE", "Runtime logout payload is invalid.");
  }

  return {};
}

function parseRateLimitWindow(payload: unknown): RuntimeRateLimitWindow | null {
  if (payload === null) {
    return null;
  }

  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  return {
    usedPercent: typeof record.usedPercent === "number" ? record.usedPercent : 0,
    windowDurationMins:
      typeof record.windowDurationMins === "number" ? record.windowDurationMins : null,
    resetsAt: typeof record.resetsAt === "number" ? record.resetsAt : null
  };
}

function parseRateLimitSnapshot(payload: unknown): RuntimeRateLimitSnapshot | null {
  if (payload === null) {
    return null;
  }

  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  return {
    limitId: requireNullableString(record.limitId),
    limitName: requireNullableString(record.limitName),
    primary: parseRateLimitWindow(record.primary),
    secondary: parseRateLimitWindow(record.secondary),
    credits: record.credits,
    planType: requireNullableString(record.planType)
  };
}

function parseRuntimeAccountRateLimitsReadResponse(
  payload: unknown
): RuntimeAccountRateLimitsReadResponse {
  const record = asRecord(payload);
  if (!record) {
    throw new DesktopBridgeError("INVALID_RESPONSE", "Runtime rate limit payload is invalid.");
  }

  const byLimitIdRecord = asRecord(record.rateLimitsByLimitId);
  const rateLimitsByLimitId =
    byLimitIdRecord === null
      ? null
      : Object.fromEntries(
          Object.entries(byLimitIdRecord).map(([key, value]) => [
            key,
            parseRateLimitSnapshot(value)
          ])
        );

  return {
    rateLimits: parseRateLimitSnapshot(record.rateLimits),
    rateLimitsByLimitId
  };
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toDesktopBridgeError(payload: unknown, fallbackMessage: string): DesktopBridgeError {
  if (!payload || typeof payload !== "object") {
    return new DesktopBridgeError("UNKNOWN_ERROR", fallbackMessage);
  }

  const candidate = payload as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "UNKNOWN_ERROR";
  const message =
    typeof candidate.message === "string" && candidate.message.trim().length > 0
      ? candidate.message
      : fallbackMessage;
  return new DesktopBridgeError(code, message);
}

async function postJson<TResponse>(input: {
  path: string;
  body?: unknown;
  errorMessage: string;
  parse: (payload: unknown) => TResponse;
}): Promise<TResponse> {
  const response = await fetch(input.path, {
    method: "POST",
    credentials: "include",
    headers: input.body
      ? {
          "content-type": "application/json"
        }
      : undefined,
    body: input.body ? JSON.stringify(input.body) : undefined
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw toDesktopBridgeError(payload, input.errorMessage);
  }

  return input.parse(payload);
}

async function localAuthStatus() {
  return await postJson({
    path: "/v1/runtime/account/read",
    body: { refreshToken: false },
    errorMessage: "Unable to load runtime account state.",
    parse: parseRuntimeAccountReadResponse
  });
}

async function localAuthStart(input: { mode: "chatgpt" | "apiKey"; apiKey?: string }) {
  const requestBody: RuntimeAccountLoginStartRequest =
    input.mode === "chatgpt"
      ? { type: "chatgpt" }
      : { type: "apiKey", apiKey: input.apiKey?.trim() ?? "" };

  return await postJson({
    path: "/v1/runtime/account/login/start",
    body: requestBody,
    errorMessage: "Unable to start runtime login.",
    parse: parseRuntimeAccountLoginStartResponse
  });
}

async function localAuthCancel(input: RuntimeAccountLoginCancelRequest) {
  return await postJson({
    path: "/v1/runtime/account/login/cancel",
    body: input,
    errorMessage: "Unable to cancel runtime login.",
    parse: parseRuntimeAccountLoginCancelResponse
  });
}

async function localAuthLogout() {
  return await postJson({
    path: "/v1/runtime/account/logout",
    errorMessage: "Unable to logout runtime account.",
    parse: parseRuntimeAccountLogoutResponse
  });
}

async function localRateLimitsRead() {
  return await postJson({
    path: "/v1/runtime/account/rate-limits/read",
    errorMessage: "Unable to read runtime rate limits.",
    parse: parseRuntimeAccountRateLimitsReadResponse
  });
}

contextBridge.exposeInMainWorld("compassDesktop", {
  isDesktop() {
    return true;
  },
  localAuthStatus,
  localAuthStart,
  localAuthCancel,
  localAuthLogout,
  localRateLimitsRead,
  async openExternal(url: string) {
    await ipcRenderer.invoke("compass:openExternal", url);
  }
});
