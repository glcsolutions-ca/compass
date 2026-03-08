import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  type RuntimeCapabilities,
  type RuntimeAccountLoginCancelResponse,
  type RuntimeAccountLoginStartRequest,
  type RuntimeAccountLoginStartResponse,
  type RuntimeAccountLogoutResponse,
  type RuntimeAccountRateLimitsReadResponse,
  type RuntimeAccountReadResponse,
  type RuntimeNotificationMethod,
  type RuntimeProvider as ContractRuntimeProvider,
  type ExecutionHost,
  type ExecutionMode,
  type ThreadListState
} from "@compass/contracts";
import { Pool, type PoolClient } from "pg";
import { ApiError } from "../auth/auth-service.js";
import type { SessionControlPlane } from "../runtime/session-control-plane.js";
import {
  __internalThreadServiceMapping,
  asRecord,
  mapEventRow,
  mapThreadRow,
  mapTurnRow,
  parseExecutionHost,
  parseExecutionMode,
  readRecordNullableString,
  readRecordString,
  readTurnOutputText
} from "./thread-mapping.js";

export { __internalThreadServiceMapping } from "./thread-mapping.js";

export interface ThreadRecord {
  threadId: string;
  workspaceId: string;
  workspaceSlug: string;
  executionMode: ExecutionMode;
  executionHost: ExecutionHost;
  status: "idle" | "inProgress" | "completed" | "interrupted" | "error";
  sessionIdentifier: string | null;
  title: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  modeSwitchedAt: string | null;
}

export interface TurnRecord {
  turnId: string;
  threadId: string;
  parentTurnId: string | null;
  sourceTurnId: string | null;
  clientRequestId: string | null;
  status: "idle" | "inProgress" | "completed" | "interrupted" | "error";
  executionMode: ExecutionMode;
  executionHost: ExecutionHost;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: string;
  completedAt: string | null;
}

export interface ThreadEventRecord {
  cursor: number;
  threadId: string;
  turnId: string | null;
  method: string;
  payload: unknown;
  createdAt: string;
}

export type RuntimeProvider = ContractRuntimeProvider;

export interface RuntimeNotificationRecord {
  cursor: number;
  method: RuntimeNotificationMethod;
  params: unknown;
  createdAt: string;
}

interface ThreadServiceThreadAccess {
  thread: ThreadRecord;
  workspaceId: string;
}

interface CloudBootstrapResult {
  runtimeMetadata: Record<string, unknown>;
}

interface CloudTurnResult {
  outputText: string;
  runtimeMetadata: Record<string, unknown>;
  runtime: {
    sessionIdentifier: string;
    connectionState: "bootstrapped" | "reused";
    runtimeKind: string;
    bootId: string;
    pid: number | null;
  } | null;
}

interface StartTurnResolvedInput {
  threadId: string;
  text: string;
  now: Date;
  executionMode: ExecutionMode;
  executionHost: ExecutionHost;
  clientRequestId: string | null;
  parentTurnId: string | null;
  sourceTurnId: string | null;
  turnId: string;
  userMessageId: string;
}

interface StartTurnTransactionResult {
  reusedTurn: TurnRecord | null;
  startedEvent: ThreadEventRecord | null;
  turnContext: StartTurnResolvedInput;
}

interface CloudInterruptResult {
  interrupted: boolean;
  runtimeMetadata: Record<string, unknown>;
}

interface AccessTokenProvider {
  getToken(): Promise<string>;
}

interface RuntimeExecutionDriver {
  readonly provider: RuntimeProvider;
  readonly capabilities: RuntimeCapabilities;
  bootstrapSession(input: { thread: ThreadRecord }): Promise<CloudBootstrapResult>;
  runTurn(input: { thread: ThreadRecord; turnId: string; text: string }): Promise<CloudTurnResult>;
  interruptTurn(input: { thread: ThreadRecord; turnId: string }): Promise<CloudInterruptResult>;
  readAccount(input: { refreshToken: boolean }): Promise<RuntimeAccountReadResponse>;
  loginStart(input: RuntimeAccountLoginStartRequest): Promise<RuntimeAccountLoginStartResponse>;
  loginCancel(input: { loginId: string }): Promise<RuntimeAccountLoginCancelResponse>;
  logout(): Promise<RuntimeAccountLogoutResponse>;
  readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse>;
  issueThreadRuntimeLaunch(input: { thread: ThreadRecord }): Promise<{
    sessionIdentifier: string;
    bootId: string;
    controlPlaneUrl: string;
    connectToken: string;
    expiresAt: string;
    runtimeKind: string;
  }>;
  subscribeNotifications(handler: (notification: RuntimeNotificationRecord) => void): () => void;
}

class MockCloudExecutionDriver implements RuntimeExecutionDriver {
  readonly provider: RuntimeProvider = "mock";
  readonly capabilities: RuntimeCapabilities = {
    interactiveAuth: false,
    supportsChatgptManaged: false,
    supportsApiKey: false,
    supportsChatgptAuthTokens: false,
    supportsRateLimits: false,
    supportsRuntimeStream: false
  };

  async bootstrapSession(input: { thread: ThreadRecord }): Promise<CloudBootstrapResult> {
    return {
      runtimeMetadata: {
        driver: "mock",
        operation: "bootstrap",
        threadId: input.thread.threadId
      }
    };
  }

  async runTurn(input: {
    thread: ThreadRecord;
    turnId: string;
    text: string;
  }): Promise<CloudTurnResult> {
    return {
      outputText: `Cloud(${input.thread.executionHost}) response: ${input.text}`,
      runtimeMetadata: {
        driver: "mock",
        turnId: input.turnId
      },
      runtime: {
        sessionIdentifier: input.thread.sessionIdentifier || `thr-${input.thread.threadId}`,
        connectionState: "reused",
        runtimeKind: "mock",
        bootId: "mock",
        pid: null
      }
    };
  }

  async interruptTurn(input: {
    thread: ThreadRecord;
    turnId: string;
  }): Promise<CloudInterruptResult> {
    return {
      interrupted: true,
      runtimeMetadata: {
        driver: "mock",
        operation: "interrupt",
        threadId: input.thread.threadId,
        turnId: input.turnId
      }
    };
  }

  async readAccount(): Promise<RuntimeAccountReadResponse> {
    return {
      provider: this.provider,
      capabilities: this.capabilities,
      authMode: null,
      requiresOpenaiAuth: false,
      account: {
        type: "mock",
        label: "Mock runtime"
      }
    };
  }

  async loginStart(): Promise<RuntimeAccountLoginStartResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async loginCancel(): Promise<RuntimeAccountLoginCancelResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async logout(): Promise<RuntimeAccountLogoutResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse> {
    return {
      rateLimits: null,
      rateLimitsByLimitId: null
    };
  }

  async issueThreadRuntimeLaunch(input: { thread: ThreadRecord }): Promise<{
    sessionIdentifier: string;
    bootId: string;
    controlPlaneUrl: string;
    connectToken: string;
    expiresAt: string;
    runtimeKind: string;
  }> {
    return {
      sessionIdentifier: input.thread.sessionIdentifier || `thr-${input.thread.threadId}`,
      bootId: "mock",
      controlPlaneUrl: "ws://localhost/mock",
      connectToken: "mock",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      runtimeKind: "mock"
    };
  }

  subscribeNotifications(): () => void {
    return () => {};
  }
}

class UnavailableCloudExecutionDriver implements RuntimeExecutionDriver {
  readonly provider: RuntimeProvider;
  readonly capabilities: RuntimeCapabilities = {
    interactiveAuth: false,
    supportsChatgptManaged: false,
    supportsApiKey: false,
    supportsChatgptAuthTokens: false,
    supportsRateLimits: false,
    supportsRuntimeStream: false
  };
  readonly #reason: string;

  constructor(input: { provider: RuntimeProvider; reason: string }) {
    this.provider = input.provider;
    this.#reason = input.reason;
  }

  private runtimeUnavailableError(): ApiError {
    return new ApiError(
      503,
      "AGENT_RUNTIME_UNAVAILABLE",
      `Runtime provider ${this.provider} is unavailable: ${this.#reason}`
    );
  }

  async bootstrapSession(): Promise<CloudBootstrapResult> {
    throw this.runtimeUnavailableError();
  }

  async runTurn(): Promise<CloudTurnResult> {
    throw this.runtimeUnavailableError();
  }

  async interruptTurn(): Promise<CloudInterruptResult> {
    throw this.runtimeUnavailableError();
  }

  async readAccount(): Promise<RuntimeAccountReadResponse> {
    throw this.runtimeUnavailableError();
  }

  async loginStart(): Promise<RuntimeAccountLoginStartResponse> {
    throw this.runtimeUnavailableError();
  }

  async loginCancel(): Promise<RuntimeAccountLoginCancelResponse> {
    throw this.runtimeUnavailableError();
  }

  async logout(): Promise<RuntimeAccountLogoutResponse> {
    throw this.runtimeUnavailableError();
  }

  async readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse> {
    throw this.runtimeUnavailableError();
  }

  async issueThreadRuntimeLaunch(): Promise<{
    sessionIdentifier: string;
    bootId: string;
    controlPlaneUrl: string;
    connectToken: string;
    expiresAt: string;
    runtimeKind: string;
  }> {
    throw this.runtimeUnavailableError();
  }

  subscribeNotifications(): () => void {
    throw this.runtimeUnavailableError();
  }
}

class SessionBackedExecutionDriver implements RuntimeExecutionDriver {
  readonly provider: RuntimeProvider;
  readonly capabilities: RuntimeCapabilities = {
    interactiveAuth: false,
    supportsChatgptManaged: false,
    supportsApiKey: false,
    supportsChatgptAuthTokens: false,
    supportsRateLimits: false,
    supportsRuntimeStream: false
  };
  readonly #controlPlane: SessionControlPlane;

  constructor(input: { provider: RuntimeProvider; controlPlane: SessionControlPlane }) {
    this.provider = input.provider;
    this.#controlPlane = input.controlPlane;
  }

  async bootstrapSession(input: { thread: ThreadRecord }): Promise<CloudBootstrapResult> {
    return {
      runtimeMetadata: {
        provider: this.provider,
        sessionIdentifier: input.thread.sessionIdentifier || `thr-${input.thread.threadId}`
      }
    };
  }

  async runTurn(input: {
    thread: ThreadRecord;
    turnId: string;
    text: string;
  }): Promise<CloudTurnResult> {
    const result = await this.#controlPlane.runTurn({
      thread: {
        threadId: input.thread.threadId,
        sessionIdentifier: input.thread.sessionIdentifier || `thr-${input.thread.threadId}`,
        executionHost: input.thread.executionHost
      },
      turnId: input.turnId,
      text: input.text
    });

    return {
      outputText: result.outputText,
      runtimeMetadata: result.runtimeMetadata,
      runtime: result.runtime
    };
  }

  async interruptTurn(input: {
    thread: ThreadRecord;
    turnId: string;
  }): Promise<CloudInterruptResult> {
    this.#controlPlane.interruptTurn({
      thread: {
        threadId: input.thread.threadId,
        sessionIdentifier: input.thread.sessionIdentifier || `thr-${input.thread.threadId}`,
        executionHost: input.thread.executionHost
      },
      turnId: input.turnId
    });

    return {
      interrupted: true,
      runtimeMetadata: {
        provider: this.provider,
        sessionIdentifier: input.thread.sessionIdentifier || `thr-${input.thread.threadId}`,
        turnId: input.turnId
      }
    };
  }

  async readAccount(): Promise<RuntimeAccountReadResponse> {
    return {
      provider: this.provider,
      capabilities: this.capabilities,
      authMode: null,
      requiresOpenaiAuth: false,
      account: {
        type: "service",
        label: "Provider-managed runtime"
      }
    };
  }

  async loginStart(): Promise<RuntimeAccountLoginStartResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async loginCancel(): Promise<RuntimeAccountLoginCancelResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async logout(): Promise<RuntimeAccountLogoutResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse> {
    return {
      rateLimits: null,
      rateLimitsByLimitId: null
    };
  }

  async issueThreadRuntimeLaunch(input: { thread: ThreadRecord }): Promise<{
    sessionIdentifier: string;
    bootId: string;
    controlPlaneUrl: string;
    connectToken: string;
    expiresAt: string;
    runtimeKind: string;
  }> {
    return this.#controlPlane.issueDesktopLaunchBundle({
      thread: {
        threadId: input.thread.threadId,
        sessionIdentifier: input.thread.sessionIdentifier || `thr-${input.thread.threadId}`,
        executionHost: input.thread.executionHost
      }
    });
  }

  subscribeNotifications(): () => void {
    return () => {};
  }
}

class ManagedIdentityTokenProvider {
  readonly #resource: string;
  readonly #clientId: string;
  #cachedToken: { value: string; expiresAtMs: number } | null = null;

  constructor(input: { resource: string; clientId: string }) {
    this.#resource = input.resource;
    this.#clientId = input.clientId;
  }

  async getToken(): Promise<string> {
    const now = Date.now();
    if (this.#cachedToken && this.#cachedToken.expiresAtMs > now + 60_000) {
      return this.#cachedToken.value;
    }

    const tokenResponse = await this.fetchToken();
    this.#cachedToken = tokenResponse;
    return tokenResponse.value;
  }

  private async fetchToken(): Promise<{ value: string; expiresAtMs: number }> {
    const identityEndpoint = String(process.env.IDENTITY_ENDPOINT || "").trim();
    const identityHeader = String(process.env.IDENTITY_HEADER || "").trim();

    if (identityEndpoint && identityHeader) {
      const url = new URL(identityEndpoint);
      url.searchParams.set("api-version", "2019-08-01");
      url.searchParams.set("resource", this.#resource);
      if (this.#clientId) {
        url.searchParams.set("client_id", this.#clientId);
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-identity-header": identityHeader,
          metadata: "true"
        }
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Managed identity token request failed (${response.status}): ${body.slice(0, 512)}`
        );
      }

      const payload = (await response.json()) as {
        access_token?: unknown;
        expires_in?: unknown;
        expires_on?: unknown;
      };

      const token = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
      if (!token) {
        throw new Error("Managed identity token response did not include access_token");
      }

      const expiresInSeconds = Number(payload.expires_in);
      const expiresOnSeconds = Number(payload.expires_on);
      const expiresAtMs = Number.isFinite(expiresOnSeconds)
        ? expiresOnSeconds * 1000
        : Date.now() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 5 * 60_000);

      return {
        value: token,
        expiresAtMs
      };
    }

    const msiEndpoint = String(process.env.MSI_ENDPOINT || "").trim();
    const msiSecret = String(process.env.MSI_SECRET || "").trim();

    if (msiEndpoint && msiSecret) {
      const url = new URL(msiEndpoint);
      url.searchParams.set("api-version", "2017-09-01");
      url.searchParams.set("resource", this.#resource);
      if (this.#clientId) {
        url.searchParams.set("clientid", this.#clientId);
      }

      const response = await fetch(url, {
        method: "GET",
        headers: {
          secret: msiSecret,
          metadata: "true"
        }
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`MSI token request failed (${response.status}): ${body.slice(0, 512)}`);
      }

      const payload = (await response.json()) as {
        access_token?: unknown;
        expires_in?: unknown;
      };

      const token = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
      if (!token) {
        throw new Error("MSI token response did not include access_token");
      }

      const expiresInSeconds = Number(payload.expires_in);
      const expiresAtMs =
        Date.now() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds * 1000 : 5 * 60_000);

      return {
        value: token,
        expiresAtMs
      };
    }

    throw new Error("Managed identity endpoint is not configured");
  }
}

class StaticAccessTokenProvider implements AccessTokenProvider {
  readonly #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  async getToken(): Promise<string> {
    return this.#token;
  }
}

class DynamicSessionsCloudExecutionDriver implements RuntimeExecutionDriver {
  readonly provider: RuntimeProvider = "dynamic_sessions";
  readonly capabilities: RuntimeCapabilities = {
    interactiveAuth: false,
    supportsChatgptManaged: false,
    supportsApiKey: false,
    supportsChatgptAuthTokens: false,
    supportsRateLimits: false,
    supportsRuntimeStream: false
  };
  private readonly endpoint: string;
  private readonly tokenProvider: AccessTokenProvider;
  private readonly requestTimeoutMs: number;

  constructor(input: {
    endpoint: string;
    tokenProvider: AccessTokenProvider;
    requestTimeoutMs: number;
  }) {
    this.endpoint = input.endpoint.replace(/\/+$/u, "");
    this.tokenProvider = input.tokenProvider;
    this.requestTimeoutMs = input.requestTimeoutMs;
  }

  async bootstrapSession(input: { thread: ThreadRecord }): Promise<CloudBootstrapResult> {
    const identifier = input.thread.sessionIdentifier || `thr-${input.thread.threadId}`;
    const payload = await this.callRuntime({
      path: "/agent/session/bootstrap",
      identifier,
      body: {
        threadId: input.thread.threadId
      }
    });

    return {
      runtimeMetadata:
        payload.runtime && typeof payload.runtime === "object"
          ? (payload.runtime as Record<string, unknown>)
          : { driver: "dynamic_sessions", operation: "bootstrap" }
    };
  }

  async runTurn(input: {
    thread: ThreadRecord;
    turnId: string;
    text: string;
  }): Promise<CloudTurnResult> {
    const identifier = input.thread.sessionIdentifier || `thr-${input.thread.threadId}`;
    const payload = await this.callRuntime({
      path: "/agent/turns/start",
      identifier,
      body: {
        threadId: input.thread.threadId,
        turnId: input.turnId,
        text: input.text
      }
    });

    const outputText = typeof payload.outputText === "string" ? payload.outputText : "";
    return {
      outputText,
      runtimeMetadata:
        payload.runtimeMetadata && typeof payload.runtimeMetadata === "object"
          ? (payload.runtimeMetadata as Record<string, unknown>)
          : { driver: "dynamic_sessions" },
      runtime: null
    };
  }

  async interruptTurn(input: {
    thread: ThreadRecord;
    turnId: string;
  }): Promise<CloudInterruptResult> {
    const identifier = input.thread.sessionIdentifier || `thr-${input.thread.threadId}`;
    const payload = await this.callRuntime({
      path: `/agent/turns/${encodeURIComponent(input.turnId)}/interrupt`,
      identifier,
      body: {}
    });

    const interrupt = payload.interrupt;
    const interruptMetadata =
      interrupt && typeof interrupt === "object"
        ? (interrupt as Record<string, unknown>)
        : { driver: "dynamic_sessions", operation: "interrupt" };
    const interrupted = payload.status === "interrupted" || interruptMetadata.interrupted === true;

    return {
      interrupted,
      runtimeMetadata: interruptMetadata
    };
  }

  async readAccount(): Promise<RuntimeAccountReadResponse> {
    return {
      provider: this.provider,
      capabilities: this.capabilities,
      authMode: null,
      requiresOpenaiAuth: false,
      account: {
        type: "service",
        label: "Managed runtime identity"
      }
    };
  }

  async loginStart(): Promise<RuntimeAccountLoginStartResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async loginCancel(): Promise<RuntimeAccountLoginCancelResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async logout(): Promise<RuntimeAccountLogoutResponse> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Interactive runtime authentication is unavailable for this runtime provider"
    );
  }

  async readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse> {
    return {
      rateLimits: null,
      rateLimitsByLimitId: null
    };
  }

  async issueThreadRuntimeLaunch(): Promise<{
    sessionIdentifier: string;
    bootId: string;
    controlPlaneUrl: string;
    connectToken: string;
    expiresAt: string;
    runtimeKind: string;
  }> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Runtime launch bundles are unavailable for this runtime provider"
    );
  }

  subscribeNotifications(): () => void {
    return () => {};
  }

  private async callRuntime(input: {
    path: string;
    identifier: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const bearerToken = await this.tokenProvider.getToken();
    const url = new URL(input.path, this.endpoint);
    url.searchParams.set("identifier", input.identifier);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`
        },
        body: JSON.stringify(input.body),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Dynamic Sessions runtime request timed out after ${String(this.requestTimeoutMs)}ms`,
          { cause: error }
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    const bodyText = await response.text();
    const bodyJson: unknown = (() => {
      try {
        const parsed = bodyText ? (JSON.parse(bodyText) as unknown) : null;
        return parsed;
      } catch {
        return null;
      }
    })();

    if (!response.ok) {
      throw new Error(
        `Dynamic Sessions runtime request failed (${response.status}): ${bodyText.slice(0, 512)}`
      );
    }

    return bodyJson && typeof bodyJson === "object" ? (bodyJson as Record<string, unknown>) : {};
  }
}

class LocalHttpExecutionDriver implements RuntimeExecutionDriver {
  readonly provider: RuntimeProvider;
  readonly capabilities: RuntimeCapabilities = {
    interactiveAuth: true,
    supportsChatgptManaged: true,
    supportsApiKey: true,
    supportsChatgptAuthTokens: true,
    supportsRateLimits: true,
    supportsRuntimeStream: true
  };
  private readonly endpoint: string;
  private readonly requestTimeoutMs: number;
  private readonly notificationEmitter = new EventEmitter();
  private streamCursor = 0;
  private streamAbort: AbortController | null = null;
  private streamRunning = false;
  private streamSubscribers = 0;

  constructor(input: { provider: RuntimeProvider; endpoint: string; requestTimeoutMs: number }) {
    this.provider = input.provider;
    this.endpoint = input.endpoint.replace(/\/+$/u, "");
    this.requestTimeoutMs = input.requestTimeoutMs;
  }

  async bootstrapSession(input: { thread: ThreadRecord }): Promise<CloudBootstrapResult> {
    const identifier = input.thread.sessionIdentifier || `thr-${input.thread.threadId}`;
    const payload = await this.callRuntimePost({
      path: "/agent/session/bootstrap",
      identifier,
      body: {
        threadId: input.thread.threadId
      }
    });

    return {
      runtimeMetadata:
        payload.runtime && typeof payload.runtime === "object"
          ? (payload.runtime as Record<string, unknown>)
          : { driver: this.provider, operation: "bootstrap" }
    };
  }

  async runTurn(input: {
    thread: ThreadRecord;
    turnId: string;
    text: string;
  }): Promise<CloudTurnResult> {
    const identifier = input.thread.sessionIdentifier || `thr-${input.thread.threadId}`;
    const payload = await this.callRuntimePost({
      path: "/agent/turns/start",
      identifier,
      body: {
        threadId: input.thread.threadId,
        turnId: input.turnId,
        text: input.text
      }
    });

    const outputText = typeof payload.outputText === "string" ? payload.outputText : "";
    return {
      outputText,
      runtimeMetadata:
        payload.runtimeMetadata && typeof payload.runtimeMetadata === "object"
          ? (payload.runtimeMetadata as Record<string, unknown>)
          : { driver: this.provider },
      runtime: null
    };
  }

  async interruptTurn(input: {
    thread: ThreadRecord;
    turnId: string;
  }): Promise<CloudInterruptResult> {
    const identifier = input.thread.sessionIdentifier || `thr-${input.thread.threadId}`;
    const payload = await this.callRuntimePost({
      path: `/agent/turns/${encodeURIComponent(input.turnId)}/interrupt`,
      identifier,
      body: {}
    });

    const interrupt = payload.interrupt;
    const interruptMetadata =
      interrupt && typeof interrupt === "object"
        ? (interrupt as Record<string, unknown>)
        : { driver: this.provider, operation: "interrupt" };
    const interrupted =
      payload["status"] === "interrupted" || interruptMetadata["interrupted"] === true;

    return {
      interrupted,
      runtimeMetadata: interruptMetadata
    };
  }

  async readAccount(input: { refreshToken: boolean }): Promise<RuntimeAccountReadResponse> {
    const payload = await this.callRuntimeRequest({
      method: "POST",
      path: "/agent/account/read",
      body: {
        refreshToken: input.refreshToken
      }
    });

    const authModeCandidate = readRecordNullableString(payload, "authMode");
    const authMode =
      authModeCandidate === "apikey" ||
      authModeCandidate === "chatgpt" ||
      authModeCandidate === "chatgptAuthTokens"
        ? authModeCandidate
        : null;

    const accountRecord = asRecord(payload.account);

    return {
      provider: this.provider,
      capabilities: this.capabilities,
      authMode,
      requiresOpenaiAuth: payload.requiresOpenaiAuth === true,
      account: accountRecord
        ? {
            ...accountRecord,
            label: readRecordNullableString(accountRecord, "label")
          }
        : null
    };
  }

  async loginStart(
    input: RuntimeAccountLoginStartRequest
  ): Promise<RuntimeAccountLoginStartResponse> {
    const payload = await this.callRuntimeRequest({
      method: "POST",
      path: "/agent/account/login/start",
      body: input
    });

    const type = readRecordString(payload, "type", "chatgpt");
    const normalizedType =
      type === "chatgpt" || type === "apiKey" || type === "chatgptAuthTokens" ? type : "chatgpt";

    return {
      type: normalizedType,
      loginId: readRecordNullableString(payload, "loginId"),
      authUrl: readRecordNullableString(payload, "authUrl")
    };
  }

  async loginCancel(input: { loginId: string }): Promise<RuntimeAccountLoginCancelResponse> {
    const payload = await this.callRuntimeRequest({
      method: "POST",
      path: "/agent/account/login/cancel",
      body: {
        loginId: input.loginId
      }
    });

    return {
      status: readRecordNullableString(payload, "status") ?? undefined
    };
  }

  async logout(): Promise<RuntimeAccountLogoutResponse> {
    await this.callRuntimeRequest({
      method: "POST",
      path: "/agent/account/logout",
      body: {}
    });
    return {};
  }

  async readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse> {
    const payload = await this.callRuntimeRequest({
      method: "POST",
      path: "/agent/account/rate-limits/read",
      body: {}
    });

    const byLimitIdRecord = asRecord(payload.rateLimitsByLimitId);
    const normalizedByLimitId: Record<string, unknown> = {};
    if (byLimitIdRecord) {
      for (const [key, value] of Object.entries(byLimitIdRecord)) {
        normalizedByLimitId[key] = value;
      }
    }

    return {
      rateLimits:
        (payload.rateLimits as RuntimeAccountRateLimitsReadResponse["rateLimits"]) ?? null,
      rateLimitsByLimitId:
        Object.keys(normalizedByLimitId).length > 0
          ? (normalizedByLimitId as RuntimeAccountRateLimitsReadResponse["rateLimitsByLimitId"])
          : null
    };
  }

  async issueThreadRuntimeLaunch(): Promise<{
    sessionIdentifier: string;
    bootId: string;
    controlPlaneUrl: string;
    connectToken: string;
    expiresAt: string;
    runtimeKind: string;
  }> {
    throw new ApiError(
      400,
      "AGENT_RUNTIME_PROVIDER_UNSUPPORTED",
      "Runtime launch bundles are unavailable for this runtime provider"
    );
  }

  subscribeNotifications(handler: (notification: RuntimeNotificationRecord) => void): () => void {
    const listener = (notification: RuntimeNotificationRecord) => {
      handler(notification);
    };
    this.notificationEmitter.on("runtime", listener);
    this.streamSubscribers += 1;

    if (!this.streamRunning) {
      this.streamRunning = true;
      void this.consumeRuntimeStream();
    }

    return () => {
      this.notificationEmitter.off("runtime", listener);
      this.streamSubscribers = Math.max(0, this.streamSubscribers - 1);
      if (this.streamSubscribers === 0 && this.streamAbort) {
        this.streamAbort.abort();
        this.streamAbort = null;
      }
    };
  }

  private async consumeRuntimeStream(): Promise<void> {
    const decoder = new TextDecoder();

    while (this.streamRunning) {
      if (this.streamSubscribers < 1) {
        this.streamRunning = false;
        return;
      }

      const controller = new AbortController();
      this.streamAbort = controller;
      const url = new URL("/agent/stream", this.endpoint);
      url.searchParams.set("cursor", String(this.streamCursor));

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            accept: "text/event-stream"
          },
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          throw new Error(`Runtime stream failed (${response.status})`);
        }

        const reader = response.body.getReader();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          let separatorIndex = buffer.indexOf("\n\n");
          while (separatorIndex >= 0) {
            const chunk = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            this.handleRuntimeSseChunk(chunk);
            separatorIndex = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // reconnect after backoff
      } finally {
        this.streamAbort = null;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 750);
      });
    }
  }

  private handleRuntimeSseChunk(chunk: string): void {
    const dataLine = chunk
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.startsWith("data:"));
    if (!dataLine) {
      return;
    }

    const payloadText = dataLine.slice(5).trim();
    if (!payloadText) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      return;
    }

    const record = asRecord(payload);
    if (!record) {
      return;
    }

    const method = readRecordString(record, "method", "");
    if (
      method !== "account/login/completed" &&
      method !== "account/updated" &&
      method !== "account/rateLimits/updated" &&
      method !== "mcpServer/oauthLogin/completed"
    ) {
      return;
    }

    const parsedCursor = Number(record.cursor);
    const cursor =
      Number.isInteger(parsedCursor) && parsedCursor > 0 ? parsedCursor : this.streamCursor + 1;
    this.streamCursor = cursor;

    this.notificationEmitter.emit("runtime", {
      cursor,
      method,
      params: record.params ?? {},
      createdAt: readRecordString(record, "createdAt", new Date().toISOString())
    } satisfies RuntimeNotificationRecord);
  }

  private async callRuntimePost(input: {
    path: string;
    identifier: string;
    body: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const url = new URL(input.path, this.endpoint);
    url.searchParams.set("identifier", input.identifier);
    return this.callRuntimeRequest({
      method: "POST",
      path: url.pathname + url.search,
      body: input.body
    });
  }

  private async callRuntimeRequest(input: {
    method: "GET" | "POST";
    path: string;
    body?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const url = new URL(input.path, this.endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: input.method,
        headers: {
          "content-type": "application/json"
        },
        body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ApiError(
          503,
          "AGENT_RUNTIME_UNAVAILABLE",
          `Local runtime request timed out after ${String(this.requestTimeoutMs)}ms`
        );
      }
      throw new ApiError(
        503,
        "AGENT_RUNTIME_UNAVAILABLE",
        error instanceof Error ? error.message : "Local runtime request failed"
      );
    } finally {
      clearTimeout(timeout);
    }

    const bodyText = await response.text();
    const bodyJson: unknown = (() => {
      try {
        const parsed = bodyText ? (JSON.parse(bodyText) as unknown) : null;
        return parsed;
      } catch {
        return null;
      }
    })();

    if (!response.ok) {
      const errorBody =
        bodyJson && typeof bodyJson === "object" ? (bodyJson as Record<string, unknown>) : {};
      const code = readRecordString(errorBody, "code", "AGENT_RUNTIME_UNAVAILABLE");
      const message =
        readRecordString(errorBody, "message", "") ||
        `Local runtime request failed (${response.status})`;
      const authRequired =
        code === "RUNTIME_EXECUTION_FAILED" && /(auth|login|api key|account)/iu.test(message);
      const status = authRequired
        ? 401
        : code === "RUNTIME_AUTH_UNSUPPORTED"
          ? 400
          : response.status >= 500
            ? 503
            : Math.max(400, response.status);
      const normalizedCode = authRequired
        ? "AGENT_RUNTIME_AUTH_REQUIRED"
        : code === "RUNTIME_AUTH_UNSUPPORTED"
          ? "AGENT_RUNTIME_PROVIDER_UNSUPPORTED"
          : code;
      throw new ApiError(status, normalizedCode, message);
    }

    return bodyJson && typeof bodyJson === "object" ? (bodyJson as Record<string, unknown>) : {};
  }
}

function parseFeatureEnabled(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  return value.trim().toLowerCase() === "true";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseRuntimeProvider(value: string | undefined): RuntimeProvider | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (
    normalized === "dynamic_sessions" ||
    normalized === "local_process" ||
    normalized === "local_docker" ||
    normalized === "mock"
  ) {
    return normalized;
  }

  return null;
}

function resolveDefaultExecutionHost(mode: ExecutionMode): ExecutionHost {
  return mode === "local" ? "desktop_local" : "dynamic_sessions";
}

function toThreadEventName(threadId: string): string {
  return `thread:${threadId}`;
}

const RUNTIME_NOTIFICATION_EVENT = "runtime:notification";

export interface ThreadService {
  listThreads(input: {
    userId: string;
    workspaceSlug: string;
    state?: ThreadListState;
    limit?: number;
  }): Promise<ThreadRecord[]>;
  createThread(input: {
    userId: string;
    workspaceSlug: string;
    executionMode: ExecutionMode;
    executionHost?: ExecutionHost;
    title?: string;
    now: Date;
  }): Promise<ThreadRecord>;
  readThread(input: { userId: string; threadId: string }): Promise<ThreadRecord>;
  updateThread(input: {
    userId: string;
    threadId: string;
    title?: string;
    archived?: boolean;
    now: Date;
  }): Promise<ThreadRecord>;
  deleteThread(input: { userId: string; threadId: string; now: Date }): Promise<{ deleted: true }>;
  switchThreadMode(input: {
    userId: string;
    threadId: string;
    executionMode: ExecutionMode;
    executionHost?: ExecutionHost;
    now: Date;
  }): Promise<ThreadRecord>;
  startTurn(input: {
    userId: string;
    threadId: string;
    text: string;
    clientRequestId?: string;
    parentTurnId?: string;
    sourceTurnId?: string;
    executionMode?: ExecutionMode;
    executionHost?: ExecutionHost;
    now: Date;
  }): Promise<{
    turn: TurnRecord;
    outputText: string | null;
    runtime?: CloudTurnResult["runtime"];
  }>;
  interruptTurn(input: {
    userId: string;
    threadId: string;
    turnId: string;
    now: Date;
  }): Promise<TurnRecord>;
  appendThreadEventsBatch(input: {
    userId: string;
    threadId: string;
    events: Array<{ turnId?: string; method: string; payload: unknown }>;
    now: Date;
  }): Promise<{ accepted: number }>;
  listThreadEvents(input: {
    userId: string;
    threadId: string;
    cursor?: number;
    limit?: number;
  }): Promise<ThreadEventRecord[]>;
  readRuntimeAccountState(input: {
    userId: string;
    refreshToken?: boolean;
  }): Promise<RuntimeAccountReadResponse>;
  startRuntimeAccountLogin(input: {
    userId: string;
    request: RuntimeAccountLoginStartRequest;
  }): Promise<RuntimeAccountLoginStartResponse>;
  cancelRuntimeAccountLogin(input: {
    userId: string;
    loginId: string;
  }): Promise<RuntimeAccountLoginCancelResponse>;
  logoutRuntimeAccount(input: { userId: string }): Promise<RuntimeAccountLogoutResponse>;
  readRuntimeRateLimits(input: { userId: string }): Promise<RuntimeAccountRateLimitsReadResponse>;
  issueThreadRuntimeLaunch(input: { userId: string; threadId: string }): Promise<{
    launch: {
      sessionIdentifier: string;
      bootId: string;
      controlPlaneUrl: string;
      connectToken: string;
      expiresAt: string;
      runtimeKind: string;
    };
  }>;
  listRuntimeNotifications(input: {
    userId: string;
    cursor?: number;
    limit?: number;
  }): Promise<RuntimeNotificationRecord[]>;
  subscribeThreadEvents(threadId: string, handler: (event: ThreadEventRecord) => void): () => void;
  subscribeRuntimeNotifications(handler: (event: RuntimeNotificationRecord) => void): () => void;
  close(): Promise<void>;
}

class PostgresThreadService implements ThreadService {
  private readonly pool: Pool;
  private readonly runtimeExecutionDriver: RuntimeExecutionDriver;
  private readonly emitter = new EventEmitter();
  private readonly runtimeNotificationBufferLimit = 1000;
  private runtimeNotificationCursor = 0;
  private readonly runtimeNotificationBuffer: RuntimeNotificationRecord[] = [];
  private runtimeNotificationUnsubscribe: (() => void) | null = null;

  constructor(input: { pool: Pool; runtimeExecutionDriver: RuntimeExecutionDriver }) {
    this.pool = input.pool;
    this.runtimeExecutionDriver = input.runtimeExecutionDriver;
    this.emitter.setMaxListeners(1000);
    try {
      this.runtimeNotificationUnsubscribe = this.runtimeExecutionDriver.subscribeNotifications(
        (notification) => {
          this.publishRuntimeNotification(notification);
        }
      );
    } catch {
      this.runtimeNotificationUnsubscribe = null;
      // runtime stream subscription is best-effort per provider
    }
  }

  async close(): Promise<void> {
    if (this.runtimeNotificationUnsubscribe) {
      this.runtimeNotificationUnsubscribe();
      this.runtimeNotificationUnsubscribe = null;
    }
    await this.pool.end();
  }

  private publishRuntimeNotification(notification: RuntimeNotificationRecord): void {
    const bufferedNotification: RuntimeNotificationRecord = {
      cursor: this.runtimeNotificationCursor + 1,
      method: notification.method,
      params: notification.params ?? {},
      createdAt: notification.createdAt || new Date().toISOString()
    };
    this.runtimeNotificationCursor = bufferedNotification.cursor;
    this.runtimeNotificationBuffer.push(bufferedNotification);
    if (this.runtimeNotificationBuffer.length > this.runtimeNotificationBufferLimit) {
      this.runtimeNotificationBuffer.splice(
        0,
        this.runtimeNotificationBuffer.length - this.runtimeNotificationBufferLimit
      );
    }

    this.emitter.emit(RUNTIME_NOTIFICATION_EVENT, bufferedNotification);
  }

  async listThreads(input: {
    userId: string;
    workspaceSlug: string;
    state?: ThreadListState;
    limit?: number;
  }): Promise<ThreadRecord[]> {
    const workspace = await this.requireWorkspaceMembership({
      userId: input.userId,
      workspaceSlug: input.workspaceSlug
    });

    const state = input.state ?? "regular";
    const limit = Number.isInteger(input.limit)
      ? Math.min(200, Math.max(1, Number(input.limit)))
      : 40;
    const archiveClause =
      state === "all"
        ? ""
        : state === "archived"
          ? "and at.archived = true"
          : "and at.archived = false";

    const result = await this.pool.query(
      `
        select
          at.thread_id,
          at.workspace_id,
          at.execution_mode,
          at.execution_host,
          at.session_identifier,
          at.title,
          at.archived,
          at.status,
          at.created_at,
          at.updated_at,
          at.mode_switched_at,
          $3::text as workspace_slug
        from agent_threads at
        where at.workspace_id = $1
        ${archiveClause}
        order by at.updated_at desc
        limit $2
      `,
      [workspace.workspaceId, limit, workspace.workspaceSlug]
    );

    return result.rows.map((row) => mapThreadRow(row as Record<string, unknown>));
  }

  async createThread(input: {
    userId: string;
    workspaceSlug: string;
    executionMode: ExecutionMode;
    executionHost?: ExecutionHost;
    title?: string;
    now: Date;
  }): Promise<ThreadRecord> {
    const workspace = await this.requireWorkspaceMembership({
      userId: input.userId,
      workspaceSlug: input.workspaceSlug
    });

    const threadId = randomUUID();
    const executionMode = input.executionMode;
    const executionHost = input.executionHost ?? resolveDefaultExecutionHost(executionMode);
    const sessionIdentifier = `thr-${threadId}`;

    const result = await this.pool.query(
      `
        insert into agent_threads (
          thread_id,
          title,
          status,
          metadata,
          created_at,
          updated_at,
          workspace_id,
          execution_mode,
          execution_host,
          session_identifier
        )
        values ($1, $2, 'idle', '{}'::jsonb, $3, $3, $4, $5, $6, $7)
        returning
          thread_id,
          workspace_id,
          execution_mode,
          execution_host,
          session_identifier,
          title,
          archived,
          status,
          created_at,
          updated_at,
          mode_switched_at,
          $8::text as workspace_slug
      `,
      [
        threadId,
        input.title?.trim() || null,
        input.now.toISOString(),
        workspace.workspaceId,
        executionMode,
        executionHost,
        sessionIdentifier,
        workspace.workspaceSlug
      ]
    );

    const thread = mapThreadRow(result.rows[0] as Record<string, unknown>);
    await this.insertAndPublishEvent({
      threadId: thread.threadId,
      turnId: null,
      method: "thread.started",
      payload: {
        thread
      },
      now: input.now
    });

    return thread;
  }

  async readThread(input: { userId: string; threadId: string }): Promise<ThreadRecord> {
    const access = await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });

    return access.thread;
  }

  async updateThread(input: {
    userId: string;
    threadId: string;
    title?: string;
    archived?: boolean;
    now: Date;
  }): Promise<ThreadRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const access = await this.requireThreadAccess(
        {
          userId: input.userId,
          threadId: input.threadId
        },
        client,
        true
      );

      const updates: string[] = ["updated_at = $2"];
      const params: unknown[] = [input.threadId, input.now.toISOString()];
      let parameterIndex = 3;

      if (input.title !== undefined) {
        updates.push(`title = $${parameterIndex}`);
        params.push(input.title.trim());
        parameterIndex += 1;
      }

      if (input.archived !== undefined) {
        updates.push(`archived = $${parameterIndex}`);
        params.push(input.archived);
        parameterIndex += 1;
      }

      if (updates.length < 2) {
        throw new ApiError(
          400,
          "INVALID_REQUEST",
          "At least one thread field must be provided for update"
        );
      }

      params.push(access.thread.workspaceSlug);

      const updated = await client.query(
        `
          update agent_threads
          set ${updates.join(", ")}
          where thread_id = $1
          returning
            thread_id,
            workspace_id,
            execution_mode,
            execution_host,
            session_identifier,
            title,
            archived,
            status,
            created_at,
            updated_at,
            mode_switched_at,
            $${parameterIndex}::text as workspace_slug
        `,
        params
      );

      if ((updated.rowCount ?? 0) < 1) {
        throw new ApiError(404, "AGENT_THREAD_NOT_FOUND", "Thread not found");
      }

      await client.query("commit");
      return mapThreadRow(updated.rows[0] as Record<string, unknown>);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteThread(input: {
    userId: string;
    threadId: string;
    now: Date;
  }): Promise<{ deleted: true }> {
    await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });

    const deleted = await this.pool.query(
      `
        delete from agent_threads
        where thread_id = $1
      `,
      [input.threadId]
    );

    if ((deleted.rowCount ?? 0) < 1) {
      throw new ApiError(404, "AGENT_THREAD_NOT_FOUND", "Thread not found");
    }

    return { deleted: true };
  }

  async switchThreadMode(input: {
    userId: string;
    threadId: string;
    executionMode: ExecutionMode;
    executionHost?: ExecutionHost;
    now: Date;
  }): Promise<ThreadRecord> {
    const executionMode = input.executionMode;
    const executionHost = input.executionHost ?? resolveDefaultExecutionHost(executionMode);

    const client = await this.pool.connect();
    try {
      await client.query("begin");

      const access = await this.requireThreadAccess(
        {
          userId: input.userId,
          threadId: input.threadId
        },
        client,
        true
      );

      const inProgress = await client.query(
        `
          select 1
          from agent_turns
          where thread_id = $1 and status = 'inProgress'
          limit 1
        `,
        [input.threadId]
      );

      if ((inProgress.rowCount ?? 0) > 0) {
        throw new ApiError(
          409,
          "AGENT_THREAD_BUSY",
          "Cannot switch mode while a turn is in progress"
        );
      }

      const updated = await client.query(
        `
          update agent_threads
          set
            execution_mode = $2,
            execution_host = $3,
            mode_switched_at = $4,
            updated_at = $4,
            session_identifier = coalesce(session_identifier, $5)
          where thread_id = $1
          returning
            thread_id,
            workspace_id,
            execution_mode,
            execution_host,
            session_identifier,
            title,
            archived,
            status,
            created_at,
            updated_at,
            mode_switched_at,
            $6::text as workspace_slug
        `,
        [
          input.threadId,
          executionMode,
          executionHost,
          input.now.toISOString(),
          `thr-${input.threadId}`,
          access.thread.workspaceSlug
        ]
      );

      if ((updated.rowCount ?? 0) < 1) {
        throw new ApiError(404, "AGENT_THREAD_NOT_FOUND", "Thread not found");
      }

      const thread = mapThreadRow(updated.rows[0] as Record<string, unknown>);
      const event = await this.insertEvent(
        {
          threadId: input.threadId,
          turnId: null,
          method: "thread.modeSwitched",
          payload: {
            executionMode,
            executionHost
          },
          now: input.now
        },
        client
      );

      await client.query("commit");
      this.publishEvent(event);

      return thread;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private normalizeStartTurnInput(input: {
    threadId: string;
    text: string;
    clientRequestId?: string;
    parentTurnId?: string;
    sourceTurnId?: string;
    executionMode?: ExecutionMode;
    executionHost?: ExecutionHost;
    now: Date;
    threadDefaults: ThreadRecord;
  }): StartTurnResolvedInput {
    const executionMode = input.executionMode ?? input.threadDefaults.executionMode;
    const executionHost = input.executionHost ?? input.threadDefaults.executionHost;

    return {
      threadId: input.threadId,
      text: input.text,
      now: input.now,
      executionMode,
      executionHost,
      clientRequestId: input.clientRequestId?.trim() || null,
      parentTurnId: input.parentTurnId?.trim() || null,
      sourceTurnId: input.sourceTurnId?.trim() || null,
      turnId: randomUUID(),
      userMessageId: randomUUID()
    };
  }

  private async readLatestTurnByClientRequest(input: {
    client: PoolClient;
    threadId: string;
    clientRequestId: string;
  }): Promise<TurnRecord | null> {
    const existingTurnResult = await input.client.query(
      `
        select
          turn_id,
          thread_id,
          parent_turn_id,
          source_turn_id,
          client_request_id,
          status,
          input,
          output,
          error,
          started_at,
          completed_at,
          execution_mode,
          execution_host
        from agent_turns
        where thread_id = $1 and client_request_id = $2
        order by started_at desc
        limit 1
      `,
      [input.threadId, input.clientRequestId]
    );
    if ((existingTurnResult.rowCount ?? 0) < 1) {
      return null;
    }

    return mapTurnRow(existingTurnResult.rows[0] as Record<string, unknown>);
  }

  private async ensureTurnReferenceExists(input: {
    client: PoolClient;
    threadId: string;
    turnId: string | null;
    notFoundCode: string;
    notFoundMessage: string;
  }): Promise<void> {
    if (!input.turnId) {
      return;
    }

    const result = await input.client.query(
      `
        select 1
        from agent_turns
        where thread_id = $1 and turn_id = $2
        limit 1
      `,
      [input.threadId, input.turnId]
    );
    if ((result.rowCount ?? 0) < 1) {
      throw new ApiError(404, input.notFoundCode, input.notFoundMessage);
    }
  }

  private async assertThreadIdleForNewTurn(client: PoolClient, threadId: string): Promise<void> {
    const inProgress = await client.query(
      `
        select 1
        from agent_turns
        where thread_id = $1 and status = 'inProgress'
        limit 1
      `,
      [threadId]
    );
    if ((inProgress.rowCount ?? 0) > 0) {
      throw new ApiError(409, "AGENT_THREAD_BUSY", "A turn is already in progress");
    }
  }

  private async insertInProgressTurn(
    client: PoolClient,
    input: StartTurnResolvedInput
  ): Promise<TurnRecord | null> {
    const insertTurn = await client.query(
      `
        insert into agent_turns (
          turn_id,
          thread_id,
          parent_turn_id,
          source_turn_id,
          client_request_id,
          status,
          input,
          output,
          error,
          started_at,
          completed_at,
          execution_mode,
          execution_host,
          runtime_metadata
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          'inProgress',
          $6::jsonb,
          null,
          null,
          $7,
          null,
          $8,
          $9,
          '{}'::jsonb
        )
        on conflict (thread_id, client_request_id)
        where client_request_id is not null
        do nothing
        returning
          turn_id,
          thread_id,
          parent_turn_id,
          source_turn_id,
          client_request_id,
          status,
          input,
          output,
          error,
          started_at,
          completed_at,
          execution_mode,
          execution_host
      `,
      [
        input.turnId,
        input.threadId,
        input.parentTurnId,
        input.sourceTurnId,
        input.clientRequestId,
        JSON.stringify({ text: input.text }),
        input.now.toISOString(),
        input.executionMode,
        input.executionHost
      ]
    );
    if ((insertTurn.rowCount ?? 0) < 1) {
      return null;
    }

    return mapTurnRow(insertTurn.rows[0] as Record<string, unknown>);
  }

  private async createTurnStartTransaction(
    input: StartTurnResolvedInput
  ): Promise<StartTurnTransactionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      if (input.clientRequestId) {
        const existingTurn = await this.readLatestTurnByClientRequest({
          client,
          threadId: input.threadId,
          clientRequestId: input.clientRequestId
        });
        if (existingTurn) {
          await client.query("commit");
          return {
            reusedTurn: existingTurn,
            startedEvent: null,
            turnContext: input
          };
        }
      }

      await this.ensureTurnReferenceExists({
        client,
        threadId: input.threadId,
        turnId: input.parentTurnId,
        notFoundCode: "AGENT_PARENT_TURN_NOT_FOUND",
        notFoundMessage: "Parent turn not found"
      });
      await this.ensureTurnReferenceExists({
        client,
        threadId: input.threadId,
        turnId: input.sourceTurnId,
        notFoundCode: "AGENT_SOURCE_TURN_NOT_FOUND",
        notFoundMessage: "Source turn not found"
      });
      await this.assertThreadIdleForNewTurn(client, input.threadId);

      const insertedTurn = await this.insertInProgressTurn(client, input);
      if (!insertedTurn && input.clientRequestId) {
        const existingTurn = await this.readLatestTurnByClientRequest({
          client,
          threadId: input.threadId,
          clientRequestId: input.clientRequestId
        });
        if (existingTurn) {
          await client.query("commit");
          return {
            reusedTurn: existingTurn,
            startedEvent: null,
            turnContext: input
          };
        }
      }

      await client.query(
        `
          insert into agent_items (
            item_id,
            thread_id,
            turn_id,
            item_type,
            status,
            payload,
            created_at,
            updated_at
          )
          values ($1, $2, $3, 'user_message', 'completed', $4::jsonb, $5, $5)
        `,
        [
          input.userMessageId,
          input.threadId,
          input.turnId,
          JSON.stringify({ text: input.text }),
          input.now.toISOString()
        ]
      );

      const startedEvent = await this.insertEvent(
        {
          threadId: input.threadId,
          turnId: input.turnId,
          method: "turn.started",
          payload: {
            turnId: input.turnId,
            text: input.text,
            userMessageId: input.userMessageId,
            parentTurnId: input.parentTurnId,
            sourceTurnId: input.sourceTurnId,
            clientRequestId: input.clientRequestId,
            executionMode: input.executionMode,
            executionHost: input.executionHost
          },
          now: input.now
        },
        client
      );
      await client.query("commit");
      return {
        reusedTurn: null,
        startedEvent,
        turnContext: input
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private async runTurnWithRuntime(input: {
    accessThread: ThreadRecord;
    turnContext: StartTurnResolvedInput;
  }): Promise<{
    cloudResult: CloudTurnResult | null;
    turnError: unknown;
    effectiveThread: ThreadRecord;
  }> {
    const effectiveThreadForExecution: ThreadRecord = {
      ...input.accessThread,
      executionMode: input.turnContext.executionMode,
      executionHost: input.turnContext.executionHost,
      sessionIdentifier: input.accessThread.sessionIdentifier || `thr-${input.turnContext.threadId}`
    };

    let cloudResult: CloudTurnResult | null = null;
    let turnError: unknown = null;
    try {
      await this.runtimeExecutionDriver.bootstrapSession({
        thread: effectiveThreadForExecution
      });
      cloudResult = await this.runtimeExecutionDriver.runTurn({
        thread: effectiveThreadForExecution,
        turnId: input.turnContext.turnId,
        text: input.turnContext.text
      });
    } catch (error) {
      turnError = {
        message: error instanceof Error ? error.message : String(error)
      };
    }

    return { cloudResult, turnError, effectiveThread: effectiveThreadForExecution };
  }

  private async completeTurnTransaction(input: {
    turnContext: StartTurnResolvedInput;
    cloudResult: CloudTurnResult | null;
    turnError: unknown;
  }): Promise<{
    turn: TurnRecord;
    outputText: string | null;
    runtime?: CloudTurnResult["runtime"];
  }> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const completionNow = new Date();
      const completionIso = completionNow.toISOString();
      const finalizedStatus = input.turnError ? "error" : "completed";
      const finalizedOutput = input.cloudResult ? { text: input.cloudResult.outputText } : null;

      const turnUpdate = await client.query(
        `
          update agent_turns
          set
            status = $3,
            output = $4::jsonb,
            error = $5::jsonb,
            completed_at = $6,
            runtime_metadata = $7::jsonb
          where turn_id = $1 and thread_id = $2
          returning
            turn_id,
            thread_id,
            parent_turn_id,
            source_turn_id,
            client_request_id,
            status,
            input,
            output,
            error,
            started_at,
            completed_at,
            execution_mode,
            execution_host
        `,
        [
          input.turnContext.turnId,
          input.turnContext.threadId,
          finalizedStatus,
          JSON.stringify(finalizedOutput),
          JSON.stringify(input.turnError),
          completionIso,
          JSON.stringify(input.cloudResult?.runtimeMetadata || {})
        ]
      );
      const updatedTurn = mapTurnRow(turnUpdate.rows[0] as Record<string, unknown>);
      const assistantMessageId = input.turnError || !input.cloudResult ? null : randomUUID();
      const cloudResult = input.cloudResult;

      if (assistantMessageId && cloudResult) {
        await client.query(
          `
            insert into agent_items (
              item_id,
              thread_id,
              turn_id,
              item_type,
              status,
              payload,
              created_at,
              updated_at
            )
            values ($1, $2, $3, 'assistant_message', 'completed', $4::jsonb, $5, $5)
          `,
          [
            assistantMessageId,
            input.turnContext.threadId,
            input.turnContext.turnId,
            JSON.stringify({ text: cloudResult.outputText }),
            completionIso
          ]
        );
      }

      const eventRows: ThreadEventRecord[] = [];
      if (input.cloudResult) {
        eventRows.push(
          await this.insertEvent(
            {
              threadId: input.turnContext.threadId,
              turnId: input.turnContext.turnId,
              method: "item.delta",
              payload: {
                type: input.turnError ? "error" : "assistant_message",
                text: input.cloudResult.outputText,
                userMessageId: input.turnContext.userMessageId,
                assistantMessageId,
                parentTurnId: input.turnContext.parentTurnId,
                sourceTurnId: input.turnContext.sourceTurnId,
                clientRequestId: input.turnContext.clientRequestId
              },
              now: completionNow
            },
            client
          )
        );
        eventRows.push(
          await this.insertEvent(
            {
              threadId: input.turnContext.threadId,
              turnId: input.turnContext.turnId,
              method: "runtime.metadata",
              payload: input.cloudResult.runtimeMetadata,
              now: completionNow
            },
            client
          )
        );
      }

      eventRows.push(
        await this.insertEvent(
          {
            threadId: input.turnContext.threadId,
            turnId: input.turnContext.turnId,
            method: "turn.completed",
            payload: {
              turnId: input.turnContext.turnId,
              userMessageId: input.turnContext.userMessageId,
              assistantMessageId,
              parentTurnId: input.turnContext.parentTurnId,
              sourceTurnId: input.turnContext.sourceTurnId,
              clientRequestId: input.turnContext.clientRequestId,
              status: updatedTurn.status,
              output: updatedTurn.output,
              error: updatedTurn.error
            },
            now: completionNow
          },
          client
        )
      );
      await client.query(
        `
          update agent_threads
          set
            status = $2,
            updated_at = $3
          where thread_id = $1
        `,
        [input.turnContext.threadId, updatedTurn.status, completionIso]
      );
      await client.query("commit");

      for (const eventRow of eventRows) {
        this.publishEvent(eventRow);
      }
      return {
        turn: updatedTurn,
        outputText: input.cloudResult?.outputText ?? null,
        runtime: input.cloudResult?.runtime ?? undefined
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async startTurn(input: {
    userId: string;
    threadId: string;
    text: string;
    clientRequestId?: string;
    parentTurnId?: string;
    sourceTurnId?: string;
    executionMode?: ExecutionMode;
    executionHost?: ExecutionHost;
    now: Date;
  }): Promise<{
    turn: TurnRecord;
    outputText: string | null;
    runtime?: CloudTurnResult["runtime"];
  }> {
    const access = await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });
    const resolvedInput = this.normalizeStartTurnInput({
      ...input,
      threadDefaults: access.thread
    });
    const startTransaction = await this.createTurnStartTransaction(resolvedInput);
    if (startTransaction.reusedTurn) {
      return {
        turn: startTransaction.reusedTurn,
        outputText: readTurnOutputText(startTransaction.reusedTurn),
        runtime: undefined
      };
    }
    if (startTransaction.startedEvent) {
      this.publishEvent(startTransaction.startedEvent);
    }

    const runtimeExecution = await this.runTurnWithRuntime({
      accessThread: access.thread,
      turnContext: resolvedInput
    });
    return this.completeTurnTransaction({
      turnContext: resolvedInput,
      cloudResult: runtimeExecution.cloudResult,
      turnError: runtimeExecution.turnError
    });
  }

  async interruptTurn(input: {
    userId: string;
    threadId: string;
    turnId: string;
    now: Date;
  }): Promise<TurnRecord> {
    const access = await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const update = await client.query(
        `
          update agent_turns
          set
            status = 'interrupted',
            completed_at = $3,
            error = '{"message":"Interrupted by user"}'::jsonb
          where thread_id = $1 and turn_id = $2 and status = 'inProgress'
          returning
            turn_id,
            thread_id,
            parent_turn_id,
            source_turn_id,
            client_request_id,
            status,
            input,
            output,
            error,
            started_at,
            completed_at,
            execution_mode,
            execution_host
        `,
        [input.threadId, input.turnId, input.now.toISOString()]
      );

      if ((update.rowCount ?? 0) < 1) {
        throw new ApiError(409, "AGENT_TURN_INTERRUPT_CONFLICT", "Turn is not interruptible");
      }

      const turn = mapTurnRow(update.rows[0] as Record<string, unknown>);
      const event = await this.insertEvent(
        {
          threadId: input.threadId,
          turnId: input.turnId,
          method: "turn.completed",
          payload: {
            turnId: input.turnId,
            parentTurnId: turn.parentTurnId,
            sourceTurnId: turn.sourceTurnId,
            clientRequestId: turn.clientRequestId,
            status: "interrupted"
          },
          now: input.now
        },
        client
      );

      await client.query(
        `
          update agent_threads
          set status = 'interrupted', updated_at = $2
          where thread_id = $1
        `,
        [input.threadId, input.now.toISOString()]
      );

      await client.query("commit");
      this.publishEvent(event);

      void this.runtimeExecutionDriver
        .interruptTurn({
          thread: {
            ...access.thread,
            executionMode: turn.executionMode,
            executionHost: turn.executionHost,
            sessionIdentifier: access.thread.sessionIdentifier || `thr-${input.threadId}`
          },
          turnId: input.turnId
        })
        .catch(() => {
          // Interrupt is best-effort; database state remains the source of truth.
        });

      return turn;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async appendThreadEventsBatch(input: {
    userId: string;
    threadId: string;
    events: Array<{ turnId?: string; method: string; payload: unknown }>;
    now: Date;
  }): Promise<{ accepted: number }> {
    await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });

    const acceptedEvents: ThreadEventRecord[] = [];
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      for (const event of input.events) {
        const inserted = await this.insertEvent(
          {
            threadId: input.threadId,
            turnId: event.turnId || null,
            method: event.method,
            payload: event.payload,
            now: input.now
          },
          client
        );
        acceptedEvents.push(inserted);
      }

      await client.query(
        `
          update agent_threads
          set updated_at = $2
          where thread_id = $1
        `,
        [input.threadId, input.now.toISOString()]
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    for (const event of acceptedEvents) {
      this.publishEvent(event);
    }

    return {
      accepted: acceptedEvents.length
    };
  }

  async listThreadEvents(input: {
    userId: string;
    threadId: string;
    cursor?: number;
    limit?: number;
  }): Promise<ThreadEventRecord[]> {
    await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });

    const cursor = Number.isInteger(input.cursor) ? Math.max(0, Number(input.cursor)) : 0;
    const limit = Number.isInteger(input.limit)
      ? Math.min(500, Math.max(1, Number(input.limit)))
      : 200;

    const result = await this.pool.query(
      `
        select id, thread_id, turn_id, method, payload, created_at
        from agent_events
        where thread_id = $1 and id > $2
        order by id asc
        limit $3
      `,
      [input.threadId, cursor, limit]
    );

    return result.rows.map((row) => mapEventRow(row as Record<string, unknown>));
  }

  async readRuntimeAccountState(input: {
    userId: string;
    refreshToken?: boolean;
  }): Promise<RuntimeAccountReadResponse> {
    try {
      return await this.runtimeExecutionDriver.readAccount({
        refreshToken: input.refreshToken === true
      });
    } catch (error) {
      this.rethrowRuntimeAuthError(error);
    }
  }

  async startRuntimeAccountLogin(input: {
    userId: string;
    request: RuntimeAccountLoginStartRequest;
  }): Promise<RuntimeAccountLoginStartResponse> {
    try {
      return await this.runtimeExecutionDriver.loginStart(input.request);
    } catch (error) {
      this.rethrowRuntimeAuthError(error);
    }
  }

  async cancelRuntimeAccountLogin(input: {
    userId: string;
    loginId: string;
  }): Promise<RuntimeAccountLoginCancelResponse> {
    try {
      return await this.runtimeExecutionDriver.loginCancel({
        loginId: input.loginId
      });
    } catch (error) {
      this.rethrowRuntimeAuthError(error);
    }
  }

  async logoutRuntimeAccount(_input: { userId: string }): Promise<RuntimeAccountLogoutResponse> {
    try {
      return await this.runtimeExecutionDriver.logout();
    } catch (error) {
      this.rethrowRuntimeAuthError(error);
    }
  }

  async readRuntimeRateLimits(_input: {
    userId: string;
  }): Promise<RuntimeAccountRateLimitsReadResponse> {
    try {
      return await this.runtimeExecutionDriver.readRateLimits();
    } catch (error) {
      this.rethrowRuntimeAuthError(error);
    }
  }

  async issueThreadRuntimeLaunch(input: { userId: string; threadId: string }): Promise<{
    launch: {
      sessionIdentifier: string;
      bootId: string;
      controlPlaneUrl: string;
      connectToken: string;
      expiresAt: string;
      runtimeKind: string;
    };
  }> {
    const access = await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });

    if (access.thread.executionHost !== "desktop_local") {
      throw new ApiError(
        400,
        "AGENT_RUNTIME_LAUNCH_UNSUPPORTED",
        "Runtime launch bundles are only available for desktop_local threads"
      );
    }

    return {
      launch: await this.runtimeExecutionDriver.issueThreadRuntimeLaunch({
        thread: access.thread
      })
    };
  }

  async listRuntimeNotifications(input: {
    userId: string;
    cursor?: number;
    limit?: number;
  }): Promise<RuntimeNotificationRecord[]> {
    const cursor = Number.isInteger(input.cursor) ? Math.max(0, Number(input.cursor)) : 0;
    const limit = Number.isInteger(input.limit)
      ? Math.min(500, Math.max(1, Number(input.limit)))
      : 200;

    const filtered = this.runtimeNotificationBuffer.filter((event) => event.cursor > cursor);
    if (filtered.length <= limit) {
      return filtered;
    }
    return filtered.slice(filtered.length - limit);
  }

  subscribeThreadEvents(threadId: string, handler: (event: ThreadEventRecord) => void): () => void {
    const eventName = toThreadEventName(threadId);
    this.emitter.on(eventName, handler);

    return () => {
      this.emitter.off(eventName, handler);
    };
  }

  subscribeRuntimeNotifications(handler: (event: RuntimeNotificationRecord) => void): () => void {
    this.emitter.on(RUNTIME_NOTIFICATION_EVENT, handler);
    return () => {
      this.emitter.off(RUNTIME_NOTIFICATION_EVENT, handler);
    };
  }

  private publishEvent(event: ThreadEventRecord): void {
    this.emitter.emit(toThreadEventName(event.threadId), event);
  }

  private async insertAndPublishEvent(input: {
    threadId: string;
    turnId: string | null;
    method: string;
    payload: unknown;
    now: Date;
  }): Promise<void> {
    const event = await this.insertEvent(input);
    this.publishEvent(event);
  }

  private async insertEvent(
    input: {
      threadId: string;
      turnId: string | null;
      method: string;
      payload: unknown;
      now: Date;
    },
    client?: PoolClient
  ): Promise<ThreadEventRecord> {
    const executor = client ?? this.pool;
    const result = await executor.query(
      `
        insert into agent_events (thread_id, turn_id, method, payload, created_at)
        values ($1, $2, $3, $4::jsonb, $5)
        returning id, thread_id, turn_id, method, payload, created_at
      `,
      [
        input.threadId,
        input.turnId,
        input.method,
        JSON.stringify(input.payload ?? {}),
        input.now.toISOString()
      ]
    );

    return mapEventRow(result.rows[0] as Record<string, unknown>);
  }

  private async requireWorkspaceMembership(
    input: { userId: string; workspaceSlug: string },
    client?: PoolClient
  ): Promise<{ workspaceId: string; workspaceSlug: string }> {
    const executor = client ?? this.pool;
    const membership = await executor.query(
      `
        select w.id as workspace_id, w.slug as workspace_slug
        from workspaces w
        inner join workspace_memberships wm on wm.workspace_id = w.id
        where w.slug = $1 and wm.user_id = $2 and wm.status = 'active'
        limit 1
      `,
      [input.workspaceSlug, input.userId]
    );

    if ((membership.rowCount ?? 0) < 1) {
      throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You are not a member of this workspace");
    }

    const membershipRow = membership.rows[0] as Record<string, unknown>;
    return {
      workspaceId: readRecordString(membershipRow, "workspace_id"),
      workspaceSlug: readRecordString(membershipRow, "workspace_slug")
    };
  }

  private async requireThreadAccess(
    input: { userId: string; threadId: string },
    client?: PoolClient,
    lockThread = false
  ): Promise<ThreadServiceThreadAccess> {
    const executor = client ?? this.pool;

    const threadResult = await executor.query(
      `
        select
          at.thread_id,
          at.workspace_id,
          w.slug as workspace_slug,
          at.execution_mode,
          at.execution_host,
          at.session_identifier,
          at.title,
          at.archived,
          at.status,
          at.created_at,
          at.updated_at,
          at.mode_switched_at
        from agent_threads at
        inner join workspaces w on w.id = at.workspace_id
        where at.thread_id = $1
        ${lockThread ? "for update" : ""}
      `,
      [input.threadId]
    );

    if ((threadResult.rowCount ?? 0) < 1) {
      throw new ApiError(404, "AGENT_THREAD_NOT_FOUND", "Thread not found");
    }

    const thread = mapThreadRow(threadResult.rows[0] as Record<string, unknown>);

    const membership = await executor.query(
      `
        select 1
        from workspace_memberships
        where workspace_id = $1 and user_id = $2 and status = 'active'
        limit 1
      `,
      [thread.workspaceId, input.userId]
    );

    if ((membership.rowCount ?? 0) < 1) {
      throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You are not a member of this workspace");
    }

    return {
      thread,
      workspaceId: thread.workspaceId
    };
  }

  private rethrowRuntimeAuthError(error: unknown): never {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      503,
      "AGENT_RUNTIME_UNAVAILABLE",
      error instanceof Error ? error.message : "Runtime is unavailable"
    );
  }
}

function resolveRuntimeProvider(env: NodeJS.ProcessEnv): RuntimeProvider {
  const explicit = parseRuntimeProvider(env.AGENT_RUNTIME_PROVIDER);
  if (explicit) {
    return explicit;
  }

  if (parseFeatureEnabled(env.AGENT_CLOUD_DRIVER_MOCK, false)) {
    return "mock";
  }

  if (
    String(env.AGENT_DEFAULT_EXECUTION_MODE || "")
      .trim()
      .toLowerCase() === "local"
  ) {
    return "local_process";
  }

  return "dynamic_sessions";
}

function buildRuntimeExecutionDriver(input: {
  env: NodeJS.ProcessEnv;
  sessionControlPlane: SessionControlPlane | null;
}): RuntimeExecutionDriver {
  const env = input.env;
  const provider = resolveRuntimeProvider(env);

  if (provider === "mock") {
    return new MockCloudExecutionDriver();
  }

  if (!input.sessionControlPlane) {
    return new UnavailableCloudExecutionDriver({
      provider,
      reason: "Session control plane is unavailable"
    });
  }

  return new SessionBackedExecutionDriver({
    provider,
    controlPlane: input.sessionControlPlane
  });
}

export const __internalThreadServiceRuntime = {
  PostgresThreadService,
  MockCloudExecutionDriver,
  UnavailableCloudExecutionDriver,
  SessionBackedExecutionDriver,
  ManagedIdentityTokenProvider,
  StaticAccessTokenProvider,
  DynamicSessionsCloudExecutionDriver,
  LocalHttpExecutionDriver,
  parseExecutionMode,
  parseExecutionHost,
  parseFeatureEnabled,
  parsePositiveInteger,
  parseRuntimeProvider,
  resolveDefaultExecutionHost,
  resolveRuntimeProvider,
  buildRuntimeExecutionDriver,
  asRecord,
  readRecordString,
  readRecordNullableString
};

export function buildDefaultThreadService(input: {
  databaseUrl: string | undefined;
  env?: NodeJS.ProcessEnv;
  sessionControlPlane?: SessionControlPlane | null;
}): { service: ThreadService | null; close: () => Promise<void> } {
  const databaseUrl = input.databaseUrl?.trim();
  const env = input.env ?? process.env;

  if (!databaseUrl || !parseFeatureEnabled(env.AGENT_GATEWAY_ENABLED, false)) {
    return {
      service: null,
      close: async () => {}
    };
  }

  const pool = new Pool({
    connectionString: databaseUrl
  });

  const service = new PostgresThreadService({
    pool,
    runtimeExecutionDriver: buildRuntimeExecutionDriver({
      env,
      sessionControlPlane: input.sessionControlPlane ?? null
    })
  });

  return {
    service,
    close: () => service.close()
  };
}
