import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  AgentExecutionHostSchema,
  AgentExecutionModeSchema,
  type RuntimeCapabilities,
  type RuntimeAccountLoginCancelResponse,
  type RuntimeAccountLoginStartRequest,
  type RuntimeAccountLoginStartResponse,
  type RuntimeAccountLogoutResponse,
  type RuntimeAccountRateLimitsReadResponse,
  type RuntimeAccountReadResponse,
  type RuntimeNotificationMethod,
  type RuntimeProvider as ContractRuntimeProvider,
  type AgentExecutionHost,
  type AgentExecutionMode
} from "@compass/contracts";
import { Pool, type PoolClient } from "pg";
import { ApiError } from "./auth-service.js";

export interface AgentThreadRecord {
  threadId: string;
  workspaceId: string;
  workspaceSlug: string;
  executionMode: AgentExecutionMode;
  executionHost: AgentExecutionHost;
  status: "idle" | "inProgress" | "completed" | "interrupted" | "error";
  cloudSessionIdentifier: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  modeSwitchedAt: string | null;
}

export interface AgentTurnRecord {
  turnId: string;
  threadId: string;
  status: "idle" | "inProgress" | "completed" | "interrupted" | "error";
  executionMode: AgentExecutionMode;
  executionHost: AgentExecutionHost;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: string;
  completedAt: string | null;
}

export interface AgentEventRecord {
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

interface AgentServiceThreadAccess {
  thread: AgentThreadRecord;
  workspaceId: string;
}

interface CloudBootstrapResult {
  runtimeMetadata: Record<string, unknown>;
}

interface CloudTurnResult {
  outputText: string;
  runtimeMetadata: Record<string, unknown>;
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
  bootstrapSession(input: { thread: AgentThreadRecord }): Promise<CloudBootstrapResult>;
  runTurn(input: {
    thread: AgentThreadRecord;
    turnId: string;
    text: string;
  }): Promise<CloudTurnResult>;
  interruptTurn(input: {
    thread: AgentThreadRecord;
    turnId: string;
  }): Promise<CloudInterruptResult>;
  readAccount(input: { refreshToken: boolean }): Promise<RuntimeAccountReadResponse>;
  loginStart(input: RuntimeAccountLoginStartRequest): Promise<RuntimeAccountLoginStartResponse>;
  loginCancel(input: { loginId: string }): Promise<RuntimeAccountLoginCancelResponse>;
  logout(): Promise<RuntimeAccountLogoutResponse>;
  readRateLimits(): Promise<RuntimeAccountRateLimitsReadResponse>;
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

  async bootstrapSession(input: { thread: AgentThreadRecord }): Promise<CloudBootstrapResult> {
    return {
      runtimeMetadata: {
        driver: "mock",
        operation: "bootstrap",
        threadId: input.thread.threadId
      }
    };
  }

  async runTurn(input: {
    thread: AgentThreadRecord;
    turnId: string;
    text: string;
  }): Promise<CloudTurnResult> {
    return {
      outputText: `Cloud(${input.thread.executionHost}) response: ${input.text}`,
      runtimeMetadata: {
        driver: "mock",
        turnId: input.turnId
      }
    };
  }

  async interruptTurn(input: {
    thread: AgentThreadRecord;
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

  subscribeNotifications(): () => void {
    throw this.runtimeUnavailableError();
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

  async bootstrapSession(input: { thread: AgentThreadRecord }): Promise<CloudBootstrapResult> {
    const identifier = input.thread.cloudSessionIdentifier || `thr-${input.thread.threadId}`;
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
    thread: AgentThreadRecord;
    turnId: string;
    text: string;
  }): Promise<CloudTurnResult> {
    const identifier = input.thread.cloudSessionIdentifier || `thr-${input.thread.threadId}`;
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
          : { driver: "dynamic_sessions" }
    };
  }

  async interruptTurn(input: {
    thread: AgentThreadRecord;
    turnId: string;
  }): Promise<CloudInterruptResult> {
    const identifier = input.thread.cloudSessionIdentifier || `thr-${input.thread.threadId}`;
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

  async bootstrapSession(input: { thread: AgentThreadRecord }): Promise<CloudBootstrapResult> {
    const identifier = input.thread.cloudSessionIdentifier || `thr-${input.thread.threadId}`;
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
    thread: AgentThreadRecord;
    turnId: string;
    text: string;
  }): Promise<CloudTurnResult> {
    const identifier = input.thread.cloudSessionIdentifier || `thr-${input.thread.threadId}`;
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
          : { driver: this.provider }
    };
  }

  async interruptTurn(input: {
    thread: AgentThreadRecord;
    turnId: string;
  }): Promise<CloudInterruptResult> {
    const identifier = input.thread.cloudSessionIdentifier || `thr-${input.thread.threadId}`;
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
    const interrupted = payload.status === "interrupted" || interruptMetadata.interrupted === true;

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

function parseExecutionMode(value: string): AgentExecutionMode {
  const parsed = AgentExecutionModeSchema.safeParse(value);
  if (!parsed.success) {
    return "cloud";
  }
  return parsed.data;
}

function parseExecutionHost(value: string): AgentExecutionHost {
  const parsed = AgentExecutionHostSchema.safeParse(value);
  if (!parsed.success) {
    return "dynamic_sessions";
  }
  return parsed.data;
}

function readRecordString(row: Record<string, unknown>, key: string, fallback = ""): string {
  const value = row[key];
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readRecordNullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function coerceIsoDate(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function readRecordIsoDate(row: Record<string, unknown>, key: string): string {
  const isoDate = coerceIsoDate(row[key]);
  if (isoDate) {
    return isoDate;
  }

  throw new RangeError(`Invalid ${key} timestamp value`);
}

function readRecordNullableIsoDate(row: Record<string, unknown>, key: string): string | null {
  return coerceIsoDate(row[key]);
}

function mapThreadRow(row: Record<string, unknown>): AgentThreadRecord {
  const executionModeValue = readRecordString(row, "execution_mode", "cloud");
  const executionHostValue = readRecordString(row, "execution_host", "dynamic_sessions");
  const statusValue = readRecordString(row, "status", "idle");

  return {
    threadId: readRecordString(row, "thread_id"),
    workspaceId: readRecordString(row, "workspace_id"),
    workspaceSlug: readRecordString(row, "workspace_slug"),
    executionMode: parseExecutionMode(executionModeValue),
    executionHost: parseExecutionHost(executionHostValue),
    status: statusValue as AgentThreadRecord["status"],
    cloudSessionIdentifier: readRecordNullableString(row, "cloud_session_identifier"),
    title: readRecordNullableString(row, "title"),
    createdAt: readRecordIsoDate(row, "created_at"),
    updatedAt: readRecordIsoDate(row, "updated_at"),
    modeSwitchedAt: readRecordNullableIsoDate(row, "mode_switched_at")
  };
}

function mapTurnRow(row: Record<string, unknown>): AgentTurnRecord {
  const statusValue = readRecordString(row, "status", "idle");
  const executionModeValue = readRecordString(row, "execution_mode", "cloud");
  const executionHostValue = readRecordString(row, "execution_host", "dynamic_sessions");

  return {
    turnId: readRecordString(row, "turn_id"),
    threadId: readRecordString(row, "thread_id"),
    status: statusValue as AgentTurnRecord["status"],
    executionMode: parseExecutionMode(executionModeValue),
    executionHost: parseExecutionHost(executionHostValue),
    input: row.input ?? null,
    output: row.output ?? null,
    error: row.error ?? null,
    startedAt: readRecordIsoDate(row, "started_at"),
    completedAt: readRecordNullableIsoDate(row, "completed_at")
  };
}

function mapEventRow(row: Record<string, unknown>): AgentEventRecord {
  return {
    cursor: Number(row.id),
    threadId: readRecordString(row, "thread_id"),
    turnId: readRecordNullableString(row, "turn_id"),
    method: readRecordString(row, "method"),
    payload: row.payload ?? {},
    createdAt: readRecordIsoDate(row, "created_at")
  };
}

export const __internalAgentServiceMapping = {
  mapThreadRow,
  mapTurnRow,
  mapEventRow
};

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

function resolveDefaultExecutionHost(mode: AgentExecutionMode): AgentExecutionHost {
  return mode === "local" ? "desktop_local" : "dynamic_sessions";
}

function toThreadEventName(threadId: string): string {
  return `thread:${threadId}`;
}

const RUNTIME_NOTIFICATION_EVENT = "runtime:notification";

export interface AgentService {
  createThread(input: {
    userId: string;
    workspaceSlug: string;
    executionMode: AgentExecutionMode;
    executionHost?: AgentExecutionHost;
    title?: string;
    now: Date;
  }): Promise<AgentThreadRecord>;
  readThread(input: { userId: string; threadId: string }): Promise<AgentThreadRecord>;
  switchThreadMode(input: {
    userId: string;
    threadId: string;
    executionMode: AgentExecutionMode;
    executionHost?: AgentExecutionHost;
    now: Date;
  }): Promise<AgentThreadRecord>;
  startTurn(input: {
    userId: string;
    threadId: string;
    text: string;
    executionMode?: AgentExecutionMode;
    executionHost?: AgentExecutionHost;
    now: Date;
  }): Promise<{ turn: AgentTurnRecord; outputText: string | null }>;
  interruptTurn(input: {
    userId: string;
    threadId: string;
    turnId: string;
    now: Date;
  }): Promise<AgentTurnRecord>;
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
  }): Promise<AgentEventRecord[]>;
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
  listRuntimeNotifications(input: {
    userId: string;
    cursor?: number;
    limit?: number;
  }): Promise<RuntimeNotificationRecord[]>;
  subscribeThreadEvents(threadId: string, handler: (event: AgentEventRecord) => void): () => void;
  subscribeRuntimeNotifications(handler: (event: RuntimeNotificationRecord) => void): () => void;
  close(): Promise<void>;
}

class PostgresAgentService implements AgentService {
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

  async createThread(input: {
    userId: string;
    workspaceSlug: string;
    executionMode: AgentExecutionMode;
    executionHost?: AgentExecutionHost;
    title?: string;
    now: Date;
  }): Promise<AgentThreadRecord> {
    const workspace = await this.requireWorkspaceMembership({
      userId: input.userId,
      workspaceSlug: input.workspaceSlug
    });

    const threadId = randomUUID();
    const executionMode = input.executionMode;
    const executionHost = input.executionHost ?? resolveDefaultExecutionHost(executionMode);
    const cloudSessionIdentifier = executionMode === "cloud" ? `thr-${threadId}` : null;

    if (executionMode === "cloud") {
      await this.runtimeExecutionDriver.bootstrapSession({
        thread: {
          threadId,
          workspaceId: workspace.workspaceId,
          workspaceSlug: workspace.workspaceSlug,
          executionMode,
          executionHost,
          status: "idle",
          cloudSessionIdentifier,
          title: input.title?.trim() || null,
          createdAt: input.now.toISOString(),
          updatedAt: input.now.toISOString(),
          modeSwitchedAt: null
        }
      });
    }

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
          cloud_session_identifier
        )
        values ($1, $2, 'idle', '{}'::jsonb, $3, $3, $4, $5, $6, $7)
        returning
          thread_id,
          workspace_id,
          execution_mode,
          execution_host,
          cloud_session_identifier,
          title,
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
        cloudSessionIdentifier,
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

  async readThread(input: { userId: string; threadId: string }): Promise<AgentThreadRecord> {
    const access = await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });

    return access.thread;
  }

  async switchThreadMode(input: {
    userId: string;
    threadId: string;
    executionMode: AgentExecutionMode;
    executionHost?: AgentExecutionHost;
    now: Date;
  }): Promise<AgentThreadRecord> {
    const executionMode = input.executionMode;
    const executionHost = input.executionHost ?? resolveDefaultExecutionHost(executionMode);
    if (executionMode === "local") {
      throw new ApiError(
        503,
        "AGENT_LOCAL_MODE_NOT_IMPLEMENTED",
        "Local mode turns are not implemented yet."
      );
    }

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
            cloud_session_identifier = case
              when $2 = 'cloud' then coalesce(cloud_session_identifier, $5)
              else cloud_session_identifier
            end
          where thread_id = $1
          returning
            thread_id,
            workspace_id,
            execution_mode,
            execution_host,
            cloud_session_identifier,
            title,
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

  async startTurn(input: {
    userId: string;
    threadId: string;
    text: string;
    executionMode?: AgentExecutionMode;
    executionHost?: AgentExecutionHost;
    now: Date;
  }): Promise<{ turn: AgentTurnRecord; outputText: string | null }> {
    const access = await this.requireThreadAccess({
      userId: input.userId,
      threadId: input.threadId
    });

    const executionMode = input.executionMode ?? access.thread.executionMode;
    const executionHost = input.executionHost ?? access.thread.executionHost;
    if (executionMode === "local") {
      throw new ApiError(
        503,
        "AGENT_LOCAL_MODE_NOT_IMPLEMENTED",
        "Local mode turns are not implemented yet."
      );
    }
    const turnId = randomUUID();

    const client = await this.pool.connect();
    try {
      await client.query("begin");

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
        throw new ApiError(409, "AGENT_THREAD_BUSY", "A turn is already in progress");
      }

      await client.query(
        `
          insert into agent_turns (
            turn_id,
            thread_id,
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
          values ($1, $2, 'inProgress', $3::jsonb, null, null, $4, null, $5, $6, '{}'::jsonb)
          returning
            turn_id,
            thread_id,
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
          turnId,
          input.threadId,
          JSON.stringify({ text: input.text }),
          input.now.toISOString(),
          executionMode,
          executionHost
        ]
      );

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
          randomUUID(),
          input.threadId,
          turnId,
          JSON.stringify({ text: input.text }),
          input.now.toISOString()
        ]
      );

      const startedEvent = await this.insertEvent(
        {
          threadId: input.threadId,
          turnId,
          method: "turn.started",
          payload: {
            turnId,
            text: input.text,
            executionMode,
            executionHost
          },
          now: input.now
        },
        client
      );

      await client.query("commit");
      this.publishEvent(startedEvent);
    } catch (error) {
      await client.query("rollback");
      client.release();
      throw error;
    }
    client.release();

    let cloudResult: CloudTurnResult | null = null;
    let turnError: unknown = null;
    const effectiveThreadForExecution: AgentThreadRecord = {
      ...access.thread,
      executionMode,
      executionHost,
      cloudSessionIdentifier:
        access.thread.cloudSessionIdentifier ||
        (executionMode === "cloud" ? `thr-${input.threadId}` : null)
    };

    try {
      await this.runtimeExecutionDriver.bootstrapSession({
        thread: effectiveThreadForExecution
      });

      cloudResult = await this.runtimeExecutionDriver.runTurn({
        thread: effectiveThreadForExecution,
        turnId,
        text: input.text
      });
    } catch (error) {
      turnError = {
        message: error instanceof Error ? error.message : String(error)
      };
    }

    const completeClient = await this.pool.connect();
    try {
      await completeClient.query("begin");
      const completionNow = new Date();
      const completionIso = completionNow.toISOString();

      const finalizedStatus = turnError ? "error" : "completed";
      const finalizedOutput = cloudResult ? { text: cloudResult.outputText } : null;

      const turnUpdate = await completeClient.query(
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
          turnId,
          input.threadId,
          finalizedStatus,
          JSON.stringify(finalizedOutput),
          JSON.stringify(turnError),
          completionIso,
          JSON.stringify(cloudResult?.runtimeMetadata || {})
        ]
      );

      const updatedTurn = mapTurnRow(turnUpdate.rows[0] as Record<string, unknown>);

      if (!turnError && cloudResult) {
        await completeClient.query(
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
            randomUUID(),
            input.threadId,
            turnId,
            JSON.stringify({ text: cloudResult.outputText }),
            completionIso
          ]
        );
      }

      const eventRows: AgentEventRecord[] = [];

      if (cloudResult) {
        const deltaEvent = await this.insertEvent(
          {
            threadId: input.threadId,
            turnId,
            method: "item.delta",
            payload: {
              type: turnError ? "error" : "assistant_message",
              text: cloudResult.outputText
            },
            now: completionNow
          },
          completeClient
        );
        eventRows.push(deltaEvent);

        const runtimeMetadataEvent = await this.insertEvent(
          {
            threadId: input.threadId,
            turnId,
            method: "runtime.metadata",
            payload: cloudResult.runtimeMetadata,
            now: completionNow
          },
          completeClient
        );
        eventRows.push(runtimeMetadataEvent);
      }

      const completedEvent = await this.insertEvent(
        {
          threadId: input.threadId,
          turnId,
          method: "turn.completed",
          payload: {
            turnId,
            status: updatedTurn.status,
            output: updatedTurn.output,
            error: updatedTurn.error
          },
          now: completionNow
        },
        completeClient
      );
      eventRows.push(completedEvent);

      await completeClient.query(
        `
          update agent_threads
          set
            status = $2,
            updated_at = $3
          where thread_id = $1
        `,
        [input.threadId, updatedTurn.status, completionIso]
      );

      await completeClient.query("commit");

      for (const eventRow of eventRows) {
        this.publishEvent(eventRow);
      }

      return {
        turn: updatedTurn,
        outputText: cloudResult?.outputText ?? null
      };
    } catch (error) {
      await completeClient.query("rollback");
      throw error;
    } finally {
      completeClient.release();
    }
  }

  async interruptTurn(input: {
    userId: string;
    threadId: string;
    turnId: string;
    now: Date;
  }): Promise<AgentTurnRecord> {
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

      if (turn.executionMode === "cloud") {
        void this.runtimeExecutionDriver
          .interruptTurn({
            thread: {
              ...access.thread,
              executionMode: turn.executionMode,
              executionHost: turn.executionHost,
              cloudSessionIdentifier:
                access.thread.cloudSessionIdentifier || `thr-${input.threadId}`
            },
            turnId: input.turnId
          })
          .catch(() => {
            // Cloud interrupt is best-effort; database state remains the source of truth.
          });
      }

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

    const acceptedEvents: AgentEventRecord[] = [];
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
  }): Promise<AgentEventRecord[]> {
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

  subscribeThreadEvents(threadId: string, handler: (event: AgentEventRecord) => void): () => void {
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

  private publishEvent(event: AgentEventRecord): void {
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
  ): Promise<AgentEventRecord> {
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
  ): Promise<AgentServiceThreadAccess> {
    const executor = client ?? this.pool;

    const threadResult = await executor.query(
      `
        select
          at.thread_id,
          at.workspace_id,
          w.slug as workspace_slug,
          at.execution_mode,
          at.execution_host,
          at.cloud_session_identifier,
          at.title,
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

  if (String(env.AGENT_RUNTIME_ENDPOINT || "").trim()) {
    return "local_process";
  }

  return "dynamic_sessions";
}

function buildRuntimeExecutionDriver(env: NodeJS.ProcessEnv): RuntimeExecutionDriver {
  const provider = resolveRuntimeProvider(env);
  const requestTimeoutMs = parsePositiveInteger(
    env.AGENT_RUNTIME_REQUEST_TIMEOUT_MS || env.DYNAMIC_SESSIONS_REQUEST_TIMEOUT_MS,
    30_000
  );

  if (provider === "mock") {
    return new MockCloudExecutionDriver();
  }

  if (provider === "local_process" || provider === "local_docker") {
    const endpoint = String(env.AGENT_RUNTIME_ENDPOINT || "").trim();
    if (!endpoint) {
      return new UnavailableCloudExecutionDriver({
        provider,
        reason: "AGENT_RUNTIME_ENDPOINT is missing"
      });
    }

    return new LocalHttpExecutionDriver({
      provider,
      endpoint,
      requestTimeoutMs
    });
  }

  const endpoint = String(env.DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT || "").trim();
  const staticBearerToken = String(env.DYNAMIC_SESSIONS_BEARER_TOKEN || "").trim();
  const tokenResource = String(
    env.DYNAMIC_SESSIONS_TOKEN_RESOURCE || "https://dynamicsessions.io"
  ).trim();
  const sessionExecutorClientId = String(env.DYNAMIC_SESSIONS_EXECUTOR_CLIENT_ID || "").trim();

  if (!endpoint) {
    return new UnavailableCloudExecutionDriver({
      provider,
      reason: "DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT is missing"
    });
  }

  const tokenProvider = staticBearerToken
    ? new StaticAccessTokenProvider(staticBearerToken)
    : new ManagedIdentityTokenProvider({
        resource: tokenResource,
        clientId: sessionExecutorClientId
      });

  return new DynamicSessionsCloudExecutionDriver({
    endpoint,
    tokenProvider,
    requestTimeoutMs
  });
}

export function buildDefaultAgentService(input: {
  databaseUrl: string | undefined;
  env?: NodeJS.ProcessEnv;
}): { service: AgentService | null; close: () => Promise<void> } {
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

  const service = new PostgresAgentService({
    pool,
    runtimeExecutionDriver: buildRuntimeExecutionDriver(env)
  });

  return {
    service,
    close: () => service.close()
  };
}
