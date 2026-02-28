import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import type { AuthService } from "./auth-service.js";
import { readSessionTokenFromCookie } from "./auth-service.js";
import type { AgentService, AgentEventRecord, RuntimeNotificationRecord } from "./agent-service.js";

interface AgentWebSocketConnection {
  send(data: string): void;
  on(event: "close", listener: () => void): void;
  close(code?: number, reason?: string): void;
}

interface AgentWebSocketServer {
  handleUpgrade(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (socket: AgentWebSocketConnection) => void
  ): void;
}

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

function parseRuntimeStreamRequest(request: IncomingMessage): boolean {
  const rawUrl = String(request.url || "");
  const url = new URL(rawUrl, "http://localhost");
  if (url.pathname !== "/v1/agent/runtime/stream") {
    return false;
  }

  return true;
}

function parseRuntimeStreamCursor(request: IncomingMessage): number {
  const rawUrl = String(request.url || "");
  const url = new URL(rawUrl, "http://localhost");
  const cursorRaw = url.searchParams.get("cursor");
  const cursorCandidate = cursorRaw ? Number(cursorRaw) : Number.NaN;
  return Number.isInteger(cursorCandidate) ? Math.max(0, cursorCandidate) : 0;
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

function sendRuntimeEvent(
  socket: { send(data: string): void },
  event: RuntimeNotificationRecord
): void {
  socket.send(
    JSON.stringify({
      type: event.method,
      method: event.method,
      cursor: event.cursor,
      payload: event.params,
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
  const wss = new WebSocketServer({ noServer: true }) as unknown as AgentWebSocketServer;

  input.server.on("upgrade", (request, socket, head) => {
    void (async () => {
      const parsedThread = parseThreadStreamRequest(request);
      const parsedRuntime = parseRuntimeStreamRequest(request);
      if (!parsedThread && !parsedRuntime) {
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
      let runtimeCursor = 0;
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
        if (parsedThread) {
          await input.agentService.readThread({
            userId,
            threadId: parsedThread.threadId
          });
        } else if (parsedRuntime) {
          runtimeCursor = parseRuntimeStreamCursor(request);
        }
      } catch {
        respondUpgradeError(socket, 403, "Agent stream access denied");
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        void (async () => {
          try {
            if (parsedThread) {
              const historical = await input.agentService!.listThreadEvents({
                userId,
                threadId: parsedThread.threadId,
                cursor: parsedThread.cursor,
                limit: 500
              });

              for (const event of historical) {
                sendEvent(ws, event);
              }

              const unsubscribe = input.agentService!.subscribeThreadEvents(
                parsedThread.threadId,
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
              return;
            }

            let replaying = true;
            let deliveredCursor = runtimeCursor;
            const bufferedEvents: RuntimeNotificationRecord[] = [];
            const unsubscribe = input.agentService!.subscribeRuntimeNotifications((event) => {
              if (replaying) {
                bufferedEvents.push(event);
                return;
              }

              if (event.cursor <= deliveredCursor) {
                return;
              }

              deliveredCursor = event.cursor;
              try {
                sendRuntimeEvent(ws, event);
              } catch {
                // ignored; socket close lifecycle handles cleanup
              }
            });

            const historical = await input.agentService!.listRuntimeNotifications({
              userId,
              cursor: runtimeCursor,
              limit: 500
            });
            for (const event of historical) {
              if (event.cursor <= deliveredCursor) {
                continue;
              }
              deliveredCursor = event.cursor;
              sendRuntimeEvent(ws, event);
            }

            replaying = false;
            bufferedEvents.sort((a, b) => a.cursor - b.cursor);
            for (const event of bufferedEvents) {
              if (event.cursor <= deliveredCursor) {
                continue;
              }
              deliveredCursor = event.cursor;
              sendRuntimeEvent(ws, event);
            }

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

export const __internalAgentWebSocket = {
  parseThreadStreamRequest,
  parseRuntimeStreamRequest,
  parseRuntimeStreamCursor
};
