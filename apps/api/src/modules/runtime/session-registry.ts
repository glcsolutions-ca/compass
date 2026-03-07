import { randomUUID } from "node:crypto";
import {
  type ControlPlaneSessionCloseMessage,
  type ControlPlaneTurnInterruptMessage,
  type ControlPlaneTurnRunMessage,
  type SessionAgentHelloMessage,
  type SessionAgentTurnErrorMessage,
  type SessionAgentTurnInterruptedMessage,
  type SessionAgentTurnResultMessage
} from "@compass/runtime-protocol";
import { WebSocket } from "ws";
import { ApiError } from "../auth/auth-service.js";

export interface SessionConnectionRecord {
  sessionIdentifier: string;
  bootId: string;
  runtimeKind: string;
  pid: number;
  connectedAt: string;
  lastHeartbeatAt: string;
  socket: WebSocket;
}

interface PendingConnectionWaiter {
  resolve: (connection: SessionConnectionRecord) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface PendingRunRequest {
  sessionIdentifier: string;
  resolve: (result: {
    outputText: string;
    bootId: string;
    runtimeKind: string;
    pid: number | null;
  }) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

function disconnectedError(message = "Session agent is disconnected"): ApiError {
  return new ApiError(502, "AGENT_SESSION_DISCONNECTED", message);
}

function connectTimeoutError(): ApiError {
  return new ApiError(
    504,
    "AGENT_SESSION_CONNECT_TIMEOUT",
    "Timed out waiting for session agent connection"
  );
}

function responseTimeoutError(): ApiError {
  return new ApiError(504, "AGENT_TURN_TIMEOUT", "Timed out waiting for session response");
}

export class SessionRegistry {
  private readonly connections = new Map<string, SessionConnectionRecord>();
  private readonly pendingConnections = new Map<string, PendingConnectionWaiter[]>();
  private readonly pendingRuns = new Map<string, PendingRunRequest>();

  hasLiveConnection(sessionIdentifier: string): boolean {
    const connection = this.connections.get(sessionIdentifier);
    return !!connection && connection.socket.readyState === WebSocket.OPEN;
  }

  getConnection(sessionIdentifier: string): SessionConnectionRecord | null {
    return this.hasLiveConnection(sessionIdentifier)
      ? (this.connections.get(sessionIdentifier) ?? null)
      : null;
  }

  waitForConnection(
    sessionIdentifier: string,
    timeoutMs: number
  ): Promise<SessionConnectionRecord> {
    const existing = this.getConnection(sessionIdentifier);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const waiters = this.pendingConnections.get(sessionIdentifier) ?? [];
        this.pendingConnections.set(
          sessionIdentifier,
          waiters.filter((entry) => entry.timeout !== timeout)
        );
        reject(connectTimeoutError());
      }, timeoutMs);

      const waiters = this.pendingConnections.get(sessionIdentifier) ?? [];
      waiters.push({ resolve, reject, timeout });
      this.pendingConnections.set(sessionIdentifier, waiters);
    });
  }

  registerConnection(input: {
    socket: WebSocket;
    hello: SessionAgentHelloMessage;
    now: Date;
  }): SessionConnectionRecord {
    const existing = this.connections.get(input.hello.sessionIdentifier);
    if (existing && existing.socket !== input.socket) {
      this.noteSocketClosed(input.hello.sessionIdentifier, existing.socket, "replaced");
      try {
        existing.socket.close(1012, "Session agent replaced");
      } catch {
        // ignore best-effort socket close
      }
    }

    const record: SessionConnectionRecord = {
      sessionIdentifier: input.hello.sessionIdentifier,
      bootId: input.hello.bootId,
      runtimeKind: input.hello.runtimeKind,
      pid: input.hello.pid,
      connectedAt: input.hello.connectedAt,
      lastHeartbeatAt: input.now.toISOString(),
      socket: input.socket
    };

    this.connections.set(record.sessionIdentifier, record);
    input.socket.on("close", () => {
      this.noteSocketClosed(record.sessionIdentifier, input.socket, "closed");
    });
    input.socket.on("error", () => {
      this.noteSocketClosed(record.sessionIdentifier, input.socket, "errored");
    });

    const waiters = this.pendingConnections.get(record.sessionIdentifier) ?? [];
    this.pendingConnections.delete(record.sessionIdentifier);
    for (const waiter of waiters) {
      clearTimeout(waiter.timeout);
      waiter.resolve(record);
    }

    return record;
  }

  recordHeartbeat(input: { sessionIdentifier: string; bootId: string; now: Date }): void {
    const connection = this.connections.get(input.sessionIdentifier);
    if (!connection || connection.bootId !== input.bootId) {
      return;
    }

    connection.lastHeartbeatAt = input.now.toISOString();
    this.connections.set(input.sessionIdentifier, connection);
  }

  async sendRun(input: {
    sessionIdentifier: string;
    threadId: string;
    turnId: string;
    text: string;
    timeoutMs: number;
  }): Promise<{ outputText: string; bootId: string; runtimeKind: string; pid: number | null }> {
    const connection = this.getConnection(input.sessionIdentifier);
    if (!connection) {
      throw disconnectedError();
    }

    const requestId = randomUUID();
    const message: ControlPlaneTurnRunMessage = {
      type: "turn.run",
      requestId,
      threadId: input.threadId,
      turnId: input.turnId,
      text: input.text
    };

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRuns.delete(requestId);
        reject(responseTimeoutError());
      }, input.timeoutMs);

      this.pendingRuns.set(requestId, {
        sessionIdentifier: input.sessionIdentifier,
        resolve,
        reject,
        timeout
      });

      try {
        connection.socket.send(JSON.stringify(message));
      } catch {
        clearTimeout(timeout);
        this.pendingRuns.delete(requestId);
        reject(disconnectedError());
      }
    });
  }

  sendInterrupt(input: { sessionIdentifier: string; threadId: string; turnId: string }): void {
    const connection = this.getConnection(input.sessionIdentifier);
    if (!connection) {
      return;
    }

    const message: ControlPlaneTurnInterruptMessage = {
      type: "turn.interrupt",
      requestId: randomUUID(),
      threadId: input.threadId,
      turnId: input.turnId
    };

    try {
      connection.socket.send(JSON.stringify(message));
    } catch {
      this.noteSocketClosed(input.sessionIdentifier, connection.socket, "interrupt-send-failed");
    }
  }

  resolveRun(message: SessionAgentTurnResultMessage): void {
    const pending = this.pendingRuns.get(message.requestId);
    if (!pending || pending.sessionIdentifier !== message.runtime.sessionIdentifier) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRuns.delete(message.requestId);
    pending.resolve({
      outputText: message.outputText,
      bootId: message.runtime.bootId,
      runtimeKind: message.runtime.runtimeKind,
      pid: message.runtime.pid ?? null
    });
  }

  resolveInterrupted(message: SessionAgentTurnInterruptedMessage): void {
    const pending = this.pendingRuns.get(message.requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRuns.delete(message.requestId);
    pending.reject(new ApiError(409, "AGENT_TURN_INTERRUPTED", "Turn was interrupted"));
  }

  rejectRun(message: SessionAgentTurnErrorMessage): void {
    const pending = this.pendingRuns.get(message.requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRuns.delete(message.requestId);
    pending.reject(new ApiError(502, message.code, message.message));
  }

  closeSession(sessionIdentifier: string, reason: string): void {
    const connection = this.connections.get(sessionIdentifier);
    if (!connection) {
      return;
    }

    const closeMessage: ControlPlaneSessionCloseMessage = {
      type: "session.close",
      reason
    };

    try {
      connection.socket.send(JSON.stringify(closeMessage));
      connection.socket.close(1000, reason);
    } catch {
      // ignore best-effort close
    }
    this.noteSocketClosed(sessionIdentifier, connection.socket, reason);
  }

  close(): void {
    for (const sessionIdentifier of this.connections.keys()) {
      this.closeSession(sessionIdentifier, "Control plane shutdown");
    }

    for (const [, waiters] of this.pendingConnections) {
      for (const waiter of waiters) {
        clearTimeout(waiter.timeout);
        waiter.reject(disconnectedError("Control plane is shutting down"));
      }
    }
    this.pendingConnections.clear();

    for (const [, pending] of this.pendingRuns) {
      clearTimeout(pending.timeout);
      pending.reject(disconnectedError("Control plane is shutting down"));
    }
    this.pendingRuns.clear();
  }

  private noteSocketClosed(sessionIdentifier: string, socket: WebSocket, reason: string): void {
    const existing = this.connections.get(sessionIdentifier);
    if (existing?.socket === socket) {
      this.connections.delete(sessionIdentifier);
    }

    for (const [requestId, pending] of this.pendingRuns) {
      if (pending.sessionIdentifier !== sessionIdentifier) {
        continue;
      }
      clearTimeout(pending.timeout);
      pending.reject(disconnectedError(`Session agent connection closed: ${reason}`));
      this.pendingRuns.delete(requestId);
    }
  }
}
