import { randomUUID } from "node:crypto";
import type { ExecutionHost } from "@compass/contracts";
import type { WebSocket } from "ws";
import { ApiError } from "../auth/auth-service.js";
import {
  createConnectTokenSecret,
  issueSessionConnectToken,
  verifySessionConnectToken,
  type SessionConnectTokenPayload
} from "./connect-token.js";
import { buildDefaultAzureDynamicSessionsHost } from "../../infrastructure/runtime-hosts/azure-dynamic-sessions.js";
import { LocalProcessSessionHost } from "../../infrastructure/runtime-hosts/local-process.js";
import { SessionRegistry } from "./session-registry.js";
import type { SessionHost } from "./session-host.js";

interface SessionThreadDescriptor {
  threadId: string;
  sessionIdentifier: string;
  executionHost: ExecutionHost;
}

export interface SessionTurnResult {
  outputText: string;
  runtimeMetadata: Record<string, unknown>;
  runtime: {
    sessionIdentifier: string;
    connectionState: "bootstrapped" | "reused";
    runtimeKind: string;
    bootId: string;
    pid: number | null;
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toWsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/internal/runtime-agent/connect";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export class SessionControlPlane {
  readonly #now: () => Date;
  readonly #registry = new SessionRegistry();
  readonly #hosts = new Map<ExecutionHost, SessionHost>();
  readonly #connectTokenSecret: string;
  readonly #loopbackBaseUrl: string;
  readonly #publicBaseUrl: string | null;
  readonly #bootstrapTimeoutMs: number;
  readonly #responseTimeoutMs: number;

  constructor(input: {
    loopbackBaseUrl: string;
    publicBaseUrl: string | null;
    connectTokenSecret?: string;
    bootstrapTimeoutMs: number;
    responseTimeoutMs: number;
    hosts: SessionHost[];
    now?: () => Date;
  }) {
    this.#loopbackBaseUrl = input.loopbackBaseUrl;
    this.#publicBaseUrl = input.publicBaseUrl;
    this.#connectTokenSecret = createConnectTokenSecret(input.connectTokenSecret);
    this.#bootstrapTimeoutMs = input.bootstrapTimeoutMs;
    this.#responseTimeoutMs = input.responseTimeoutMs;
    this.#now = input.now ?? (() => new Date());

    for (const host of input.hosts) {
      this.#hosts.set(host.executionHost, host);
    }
  }

  verifySessionConnectToken(token: string, now: Date): SessionConnectTokenPayload | null {
    return verifySessionConnectToken({
      token,
      secret: this.#connectTokenSecret,
      now
    });
  }

  acceptHello(input: {
    tokenPayload: SessionConnectTokenPayload;
    hello: {
      sessionIdentifier: string;
      bootId: string;
      runtimeKind: string;
      pid: number;
      connectedAt: string;
    };
    socket: WebSocket;
    now: Date;
  }): void {
    if (
      input.hello.sessionIdentifier !== input.tokenPayload.sessionIdentifier ||
      input.hello.bootId !== input.tokenPayload.bootId
    ) {
      throw new ApiError(401, "AGENT_SESSION_CONNECT_INVALID", "Session agent token mismatch");
    }

    this.#registry.registerConnection({
      socket: input.socket,
      hello: {
        type: "session.hello",
        sessionIdentifier: input.hello.sessionIdentifier,
        bootId: input.hello.bootId,
        runtimeKind: input.hello.runtimeKind,
        pid: input.hello.pid,
        connectedAt: input.hello.connectedAt
      },
      now: input.now
    });
  }

  acceptHeartbeat(input: { sessionIdentifier: string; bootId: string; now: Date }): void {
    this.#registry.recordHeartbeat(input);
  }

  acceptTurnResult(message: {
    requestId: string;
    turnId: string;
    outputText: string;
    runtime: {
      sessionIdentifier: string;
      bootId: string;
      runtimeKind: string;
      pid?: number | null;
    };
  }): void {
    this.#registry.resolveRun({
      type: "turn.result",
      requestId: message.requestId,
      turnId: message.turnId,
      outputText: message.outputText,
      runtime: message.runtime
    });
  }

  acceptTurnInterrupted(message: {
    requestId: string;
    turnId: string;
    runtime: {
      sessionIdentifier: string;
      bootId: string;
      runtimeKind: string;
      pid?: number | null;
    };
  }): void {
    this.#registry.resolveInterrupted({
      type: "turn.interrupted",
      requestId: message.requestId,
      turnId: message.turnId,
      runtime: message.runtime
    });
  }

  acceptTurnError(message: {
    requestId: string;
    turnId: string;
    code: string;
    message: string;
  }): void {
    this.#registry.rejectRun({
      type: "turn.error",
      requestId: message.requestId,
      turnId: message.turnId,
      code: message.code,
      message: message.message
    });
  }

  async runTurn(input: {
    thread: SessionThreadDescriptor;
    turnId: string;
    text: string;
  }): Promise<SessionTurnResult> {
    const connection = await this.ensureConnected(input.thread);
    const result = await this.#registry.sendRun({
      sessionIdentifier: input.thread.sessionIdentifier,
      threadId: input.thread.threadId,
      turnId: input.turnId,
      text: input.text,
      timeoutMs: this.#responseTimeoutMs
    });

    return {
      outputText: result.outputText,
      runtimeMetadata: {
        sessionIdentifier: input.thread.sessionIdentifier,
        connectionState: connection.connectionState,
        runtimeKind: result.runtimeKind,
        bootId: result.bootId,
        pid: result.pid
      },
      runtime: {
        sessionIdentifier: input.thread.sessionIdentifier,
        connectionState: connection.connectionState,
        runtimeKind: result.runtimeKind,
        bootId: result.bootId,
        pid: result.pid
      }
    };
  }

  interruptTurn(input: { thread: SessionThreadDescriptor; turnId: string }): void {
    this.#registry.sendInterrupt({
      sessionIdentifier: input.thread.sessionIdentifier,
      threadId: input.thread.threadId,
      turnId: input.turnId
    });
  }

  issueDesktopLaunchBundle(input: { thread: SessionThreadDescriptor }): {
    sessionIdentifier: string;
    bootId: string;
    controlPlaneUrl: string;
    connectToken: string;
    expiresAt: string;
    runtimeKind: string;
  } {
    const controlPlaneUrl = this.requirePublicControlPlaneUrl();
    const bootId = randomUUID();
    const ttlMs = this.#bootstrapTimeoutMs + 10_000;
    const issuedAt = this.#now();
    return {
      sessionIdentifier: input.thread.sessionIdentifier,
      bootId,
      controlPlaneUrl,
      connectToken: issueSessionConnectToken({
        secret: this.#connectTokenSecret,
        sessionIdentifier: input.thread.sessionIdentifier,
        bootId,
        ttlMs,
        now: issuedAt
      }),
      expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
      runtimeKind: "echo"
    };
  }

  close(): void {
    this.#registry.close();
  }

  private async ensureConnected(input: SessionThreadDescriptor): Promise<{
    connectionState: "bootstrapped" | "reused";
  }> {
    if (this.#registry.hasLiveConnection(input.sessionIdentifier)) {
      return {
        connectionState: "reused"
      };
    }

    const host = this.requireHost(input.executionHost);
    const controlPlaneUrl = host.requiresPublicControlPlaneUrl
      ? this.requirePublicControlPlaneUrl()
      : toWsUrl(this.#loopbackBaseUrl);

    const primaryBootId = randomUUID();
    try {
      await host.bootstrapSessionAgent({
        sessionIdentifier: input.sessionIdentifier,
        bootId: primaryBootId,
        connectToken: issueSessionConnectToken({
          secret: this.#connectTokenSecret,
          sessionIdentifier: input.sessionIdentifier,
          bootId: primaryBootId,
          ttlMs: this.#bootstrapTimeoutMs + 10_000,
          now: this.#now()
        }),
        controlPlaneUrl,
        forceRestart: false
      });
      await this.#registry.waitForConnection(input.sessionIdentifier, this.#bootstrapTimeoutMs);
      return {
        connectionState: "bootstrapped"
      };
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== "AGENT_SESSION_CONNECT_TIMEOUT") {
        throw error;
      }
    }

    const restartBootId = randomUUID();
    await host.bootstrapSessionAgent({
      sessionIdentifier: input.sessionIdentifier,
      bootId: restartBootId,
      connectToken: issueSessionConnectToken({
        secret: this.#connectTokenSecret,
        sessionIdentifier: input.sessionIdentifier,
        bootId: restartBootId,
        ttlMs: this.#bootstrapTimeoutMs + 10_000,
        now: this.#now()
      }),
      controlPlaneUrl,
      forceRestart: true
    });
    await this.#registry.waitForConnection(input.sessionIdentifier, this.#bootstrapTimeoutMs);
    return {
      connectionState: "bootstrapped"
    };
  }

  private requireHost(executionHost: ExecutionHost): SessionHost {
    const host = this.#hosts.get(executionHost);
    if (!host) {
      throw new ApiError(
        503,
        "AGENT_RUNTIME_UNAVAILABLE",
        `No session host is configured for execution host ${executionHost}`
      );
    }
    return host;
  }

  private requirePublicControlPlaneUrl(): string {
    if (!this.#publicBaseUrl) {
      throw new ApiError(
        503,
        "AGENT_RUNTIME_UNAVAILABLE",
        "API_PUBLIC_BASE_URL is required for remote session hosts"
      );
    }

    return toWsUrl(this.#publicBaseUrl);
  }
}

export function buildDefaultSessionControlPlane(input: {
  env?: NodeJS.ProcessEnv;
  apiPort: number;
  now?: () => Date;
}): SessionControlPlane {
  const env = input.env ?? process.env;
  const hosts: SessionHost[] = [];
  const localWorkRoot = String(
    env.AGENT_SESSION_LOCAL_WORK_ROOT || ".artifacts/runtime-agents"
  ).trim();
  const enableLocalProcessHost =
    String(env.AGENT_ENABLE_LOCAL_PROCESS_HOST || "")
      .trim()
      .toLowerCase() === "true" ||
    String(env.AGENT_DEFAULT_EXECUTION_MODE || "")
      .trim()
      .toLowerCase() === "local";

  if (enableLocalProcessHost) {
    hosts.push(
      new LocalProcessSessionHost({
        workRoot: localWorkRoot
      })
    );
  }

  if (String(env.DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT || "").trim()) {
    hosts.push(buildDefaultAzureDynamicSessionsHost(env));
  }

  return new SessionControlPlane({
    loopbackBaseUrl: `http://127.0.0.1:${String(input.apiPort)}`,
    publicBaseUrl: String(env.API_PUBLIC_BASE_URL || "").trim() || null,
    connectTokenSecret: String(env.AGENT_SESSION_CONNECT_SECRET || "").trim() || undefined,
    bootstrapTimeoutMs: parsePositiveInteger(env.AGENT_SESSION_BOOTSTRAP_TIMEOUT_MS, 30_000),
    responseTimeoutMs: parsePositiveInteger(env.AGENT_SESSION_RESPONSE_TIMEOUT_MS, 20_000),
    hosts,
    now: input.now
  });
}
