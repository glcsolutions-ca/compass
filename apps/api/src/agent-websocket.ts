import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { AuthService } from "./auth-service.js";
import { readSessionTokenFromCookie } from "./auth-service.js";
import type { AgentService, AgentEventRecord } from "./agent-service.js";

function readSessionCookieToken(request: IncomingMessage): string | null {
  const cookieHeader = request.headers.cookie;
  if (Array.isArray(cookieHeader)) {
    return readSessionTokenFromCookie(cookieHeader.join(";"));
  }

  return readSessionTokenFromCookie(cookieHeader);
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

function parseThreadStreamRequest(request: IncomingMessage): {
  threadId: string;
  cursor: number;
} | null {
  const rawUrl = String(request.url || "");
  const url = new URL(rawUrl, "http://localhost");
  const match = /^\/v1\/agent\/threads\/([^/]+)\/stream$/u.exec(url.pathname);
  if (!match) {
    return null;
  }

  const threadId = decodeURIComponent(match[1] || "").trim();
  if (!threadId) {
    return null;
  }

  const cursorRaw = url.searchParams.get("cursor");
  const cursorCandidate = cursorRaw ? Number(cursorRaw) : Number.NaN;
  const cursor = Number.isInteger(cursorCandidate) ? Math.max(0, cursorCandidate) : 0;

  return {
    threadId,
    cursor
  };
}

function sendEvent(socket: { send(data: string): void }, event: AgentEventRecord): void {
  socket.send(
    JSON.stringify({
      type: event.method,
      method: event.method,
      cursor: event.cursor,
      payload: event.payload,
      threadId: event.threadId,
      turnId: event.turnId,
      createdAt: event.createdAt
    })
  );
}

export function attachAgentWebSocketGateway(input: {
  server: Server;
  authService: AuthService | null;
  agentService: AgentService | null;
  now: () => Date;
}): void {
  const wss = new WebSocketServer({ noServer: true });

  input.server.on("upgrade", (request, socket, head) => {
    void (async () => {
      const parsed = parseThreadStreamRequest(request);
      if (!parsed) {
        return;
      }

      if (!input.authService || !input.agentService) {
        respondUpgradeError(socket, 503, "Agent websocket is not configured");
        return;
      }

      const sessionToken = readSessionCookieToken(request);
      if (!sessionToken) {
        respondUpgradeError(socket, 401, "Authentication required");
        return;
      }

      let userId = "";
      try {
        const auth = await input.authService.readAuthMe({
          sessionToken,
          now: input.now()
        });

        if (!auth.authenticated || !auth.user?.id) {
          respondUpgradeError(socket, 401, "Authentication required");
          return;
        }

        userId = auth.user.id;
        await input.agentService.readThread({
          userId,
          threadId: parsed.threadId
        });
      } catch {
        respondUpgradeError(socket, 403, "Thread stream access denied");
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        void (async () => {
          try {
            const historical = await input.agentService!.listThreadEvents({
              userId,
              threadId: parsed.threadId,
              cursor: parsed.cursor,
              limit: 500
            });

            for (const event of historical) {
              sendEvent(ws, event);
            }

            const unsubscribe = input.agentService!.subscribeThreadEvents(
              parsed.threadId,
              (event) => {
                try {
                  sendEvent(ws, event);
                } catch {
                  // ignored; socket close lifecycle handles cleanup
                }
              }
            );

            ws.on("close", () => {
              unsubscribe();
            });
          } catch {
            try {
              ws.close(1011, "Agent stream setup failed");
            } catch {
              // ignore close errors
            }
          }
        })();
      });
    })();
  });
}
