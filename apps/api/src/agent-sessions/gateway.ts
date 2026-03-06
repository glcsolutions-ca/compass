import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import {
  SessionAgentHelloMessageSchema,
  SessionAgentInboundMessageSchema
} from "@compass/session-agent-protocol";
import { WebSocketServer, type WebSocket } from "ws";
import { parseAuthError } from "../auth-service.js";
import type { SessionControlPlane } from "./session-control-plane.js";

interface SessionAgentWebSocketServer {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (socket: WebSocket) => void
  ): void;
}

function respondUpgradeError(socket: Duplex, code: number, message: string): void {
  socket.write(
    `HTTP/1.1 ${code} ${message}\r\n` +
      "Content-Type: application/json\r\n" +
      "Connection: close\r\n" +
      "\r\n" +
      JSON.stringify({ code: "WS_UPGRADE_REJECTED", message })
  );
  socket.destroy();
}

function matchesSessionAgentPath(request: IncomingMessage): boolean {
  const url = new URL(String(request.url || "/"), "http://localhost");
  return url.pathname === "/internal/session-agent/connect";
}

function readBearerToken(request: IncomingMessage): string | null {
  const header = request.headers["authorization"];
  const value =
    typeof header === "string"
      ? header
      : Array.isArray(header) && typeof header[0] === "string"
        ? header[0]
        : null;
  if (!value) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/iu.exec(value.trim());
  return match?.[1]?.trim() || null;
}

function readTextPayload(data: unknown): string | null {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  return null;
}

export function attachSessionAgentGateway(input: {
  server: Server;
  controlPlane: SessionControlPlane | null;
  now: () => Date;
}): void {
  const wss = new WebSocketServer({ noServer: true }) as unknown as SessionAgentWebSocketServer;

  input.server.on("upgrade", (request, socket, head) => {
    if (!matchesSessionAgentPath(request)) {
      return;
    }

    if (!input.controlPlane) {
      respondUpgradeError(socket, 503, "Session control plane is not configured");
      return;
    }

    const token = readBearerToken(request);
    if (!token) {
      respondUpgradeError(socket, 401, "Session agent bearer token is required");
      return;
    }

    const tokenPayload = input.controlPlane.verifySessionConnectToken(token, input.now());
    if (!tokenPayload) {
      respondUpgradeError(socket, 401, "Session agent bearer token is invalid");
      return;
    }

    wss.handleUpgrade(request, socket, head, (websocket) => {
      let registered = false;

      websocket.on("message", (payload) => {
        const text = readTextPayload(payload);
        if (!text) {
          websocket.close(1003, "Invalid message payload");
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          websocket.close(1003, "Invalid JSON payload");
          return;
        }

        if (!registered) {
          const hello = SessionAgentHelloMessageSchema.safeParse(parsed);
          if (!hello.success) {
            websocket.close(1008, "Session agent hello is required");
            return;
          }

          try {
            input.controlPlane?.acceptHello({
              tokenPayload,
              hello: hello.data,
              socket: websocket,
              now: input.now()
            });
            registered = true;
          } catch (error) {
            const parsedError = parseAuthError(error);
            websocket.close(1008, parsedError.code);
          }
          return;
        }

        const message = SessionAgentInboundMessageSchema.safeParse(parsed);
        if (!message.success) {
          websocket.close(1003, "Invalid session agent message");
          return;
        }

        switch (message.data.type) {
          case "session.hello":
            websocket.close(1008, "Session hello already received");
            return;
          case "session.heartbeat":
            input.controlPlane?.acceptHeartbeat({
              sessionIdentifier: message.data.sessionIdentifier,
              bootId: message.data.bootId,
              now: input.now()
            });
            return;
          case "turn.result":
            input.controlPlane?.acceptTurnResult(message.data);
            return;
          case "turn.interrupted":
            input.controlPlane?.acceptTurnInterrupted(message.data);
            return;
          case "turn.error":
            input.controlPlane?.acceptTurnError(message.data);
        }
      });
    });
  });
}

export const __internalSessionAgentGateway = {
  matchesSessionAgentPath,
  readBearerToken,
  readTextPayload
};
