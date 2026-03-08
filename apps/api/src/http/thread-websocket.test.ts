import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, type RawData } from "ws";
import { attachThreadWebSocketGateway, __internalThreadWebSocket } from "./thread-websocket.js";
import type { AuthService } from "~/modules/auth/auth-service.js";
import type {
  ThreadEventRecord,
  ThreadService,
  RuntimeNotificationRecord
} from "~/modules/threads/thread-service.js";

function buildRuntimeNotification(
  input: Partial<RuntimeNotificationRecord> & {
    cursor: number;
    method: RuntimeNotificationRecord["method"];
  }
): RuntimeNotificationRecord {
  return {
    cursor: input.cursor,
    method: input.method,
    params: input.params ?? {},
    createdAt: input.createdAt ?? "2026-03-01T00:00:00.000Z"
  };
}

function rawDataToString(payload: RawData): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }

  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString("utf8");
  }

  return payload.toString("utf8");
}

async function nextJsonMessage(websocket: WebSocket): Promise<Record<string, unknown>> {
  return await new Promise((resolve, reject) => {
    const onMessage = (payload: RawData) => {
      cleanup();
      resolve(JSON.parse(rawDataToString(payload)) as Record<string, unknown>);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      websocket.off("message", onMessage);
      websocket.off("error", onError);
    };

    websocket.on("message", onMessage);
    websocket.on("error", onError);
  });
}

describe("agent websocket runtime stream", () => {
  const servers = new Set<Server>();
  const sockets = new Set<WebSocket>();

  afterEach(async () => {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    }
    sockets.clear();

    for (const server of servers) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    servers.clear();
  });

  it("replays runtime notifications from cursor before delivering live notifications", async () => {
    let runtimeHandler: ((event: RuntimeNotificationRecord) => void) | null = null;
    const unsubscribe = vi.fn();
    const listRuntimeNotifications = vi.fn(async () => [
      buildRuntimeNotification({
        cursor: 2,
        method: "account/updated",
        params: { authMode: "chatgpt" }
      })
    ]);
    const subscribeRuntimeNotifications = vi.fn(
      (handler: (event: RuntimeNotificationRecord) => void) => {
        runtimeHandler = handler;
        return unsubscribe;
      }
    );

    const authService = {
      readAuthMe: vi.fn(async () => ({
        authenticated: true,
        user: { id: "usr-1" }
      }))
    } as unknown as AuthService;

    const threadService = {
      listRuntimeNotifications,
      subscribeRuntimeNotifications
    } as unknown as ThreadService;

    const server = createServer((_request, response) => {
      response.statusCode = 404;
      response.end();
    });
    servers.add(server);

    attachThreadWebSocketGateway({
      server,
      authService,
      threadService,
      now: () => new Date("2026-03-01T00:00:00.000Z")
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not expose numeric address");
    }

    const ws = new WebSocket(`ws://127.0.0.1:${String(address.port)}/v1/runtime/stream?cursor=1`, {
      headers: {
        cookie: "__Host-compass_session=session-token"
      }
    });
    sockets.add(ws);

    const replayMessagePromise = nextJsonMessage(ws);
    await once(ws, "open");
    const replayMessage = await replayMessagePromise;
    expect(replayMessage.cursor).toBe(2);
    expect(replayMessage.method).toBe("account/updated");
    expect(listRuntimeNotifications).toHaveBeenCalledWith({
      userId: "usr-1",
      cursor: 1,
      limit: 500
    });

    expect(runtimeHandler).toBeTruthy();
    const liveMessagePromise = nextJsonMessage(ws);
    runtimeHandler?.(
      buildRuntimeNotification({
        cursor: 3,
        method: "account/login/completed",
        params: { loginId: "login-1", success: true, error: null }
      })
    );

    const liveMessage = await liveMessagePromise;
    expect(liveMessage.cursor).toBe(3);
    expect(liveMessage.method).toBe("account/login/completed");

    ws.close();
    await once(ws, "close");
  });

  it("uses cursor=0 by default and streams live notifications", async () => {
    let runtimeHandler: ((event: RuntimeNotificationRecord) => void) | null = null;
    const listRuntimeNotifications = vi.fn(async () => []);
    const subscribeRuntimeNotifications = vi.fn(
      (handler: (event: RuntimeNotificationRecord) => void) => {
        runtimeHandler = handler;
        return () => {};
      }
    );

    const authService = {
      readAuthMe: vi.fn(async () => ({
        authenticated: true,
        user: { id: "usr-2" }
      }))
    } as unknown as AuthService;

    const threadService = {
      listRuntimeNotifications,
      subscribeRuntimeNotifications
    } as unknown as ThreadService;

    const server = createServer((_request, response) => {
      response.statusCode = 404;
      response.end();
    });
    servers.add(server);

    attachThreadWebSocketGateway({
      server,
      authService,
      threadService,
      now: () => new Date("2026-03-01T00:00:00.000Z")
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not expose numeric address");
    }

    const ws = new WebSocket(`ws://127.0.0.1:${String(address.port)}/v1/runtime/stream`, {
      headers: {
        cookie: "__Host-compass_session=session-token"
      }
    });
    sockets.add(ws);

    await once(ws, "open");
    expect(listRuntimeNotifications).toHaveBeenCalledWith({
      userId: "usr-2",
      cursor: 0,
      limit: 500
    });

    const liveMessagePromise = nextJsonMessage(ws);
    runtimeHandler?.(
      buildRuntimeNotification({
        cursor: 1,
        method: "account/rateLimits/updated",
        params: {
          rateLimits: {
            limitId: "codex",
            primary: { usedPercent: 20, windowDurationMins: 15, resetsAt: 1730947200 }
          }
        }
      })
    );

    const liveMessage = await liveMessagePromise;
    expect(liveMessage.method).toBe("account/rateLimits/updated");
    expect(liveMessage.cursor).toBe(1);

    ws.close();
    await once(ws, "close");
  });
});

describe("agent websocket thread stream", () => {
  const servers = new Set<Server>();
  const sockets = new Set<WebSocket>();

  afterEach(async () => {
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    }
    sockets.clear();

    for (const server of servers) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    servers.clear();
  });

  it("replays thread history and forwards live thread events", async () => {
    let threadHandler:
      | ((
          event: Parameters<NonNullable<ThreadService["subscribeThreadEvents"]>>[1] extends (
            arg: infer T
          ) => unknown
            ? T
            : never
        ) => void)
      | null = null;
    const unsubscribe = vi.fn();
    const authService = {
      readAuthMe: vi.fn(async () => ({
        authenticated: true,
        user: { id: "usr-1" }
      }))
    } as unknown as AuthService;
    const threadService = {
      readThread: vi.fn(async () => ({
        threadId: "thread-1"
      })),
      listThreadEvents: vi.fn(async () => [
        {
          cursor: 1,
          threadId: "thread-1",
          turnId: null,
          method: "thread.started",
          payload: { title: "first" },
          createdAt: "2026-03-01T00:00:00.000Z"
        }
      ]),
      subscribeThreadEvents: vi.fn(
        (threadId: string, handler: (event: ThreadEventRecord) => void) => {
          if (threadId !== "thread-1") {
            throw new Error("unexpected thread id");
          }
          threadHandler = handler;
          return unsubscribe;
        }
      )
    } as unknown as ThreadService;

    const server = createServer((_request, response) => {
      response.statusCode = 404;
      response.end();
    });
    servers.add(server);

    attachThreadWebSocketGateway({
      server,
      authService,
      threadService,
      now: () => new Date("2026-03-01T00:00:00.000Z")
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not expose numeric address");
    }

    const ws = new WebSocket(
      `ws://127.0.0.1:${String(address.port)}/v1/threads/thread-1/stream?cursor=0`,
      {
        headers: {
          cookie: "__Host-compass_session=session-token"
        }
      }
    );
    sockets.add(ws);

    const replayMessagePromise = nextJsonMessage(ws);
    await once(ws, "open");
    const replayMessage = await replayMessagePromise;
    expect(replayMessage.method).toBe("thread.started");
    expect(replayMessage.cursor).toBe(1);

    if (!threadHandler) {
      throw new Error("thread handler was not registered");
    }

    const liveMessagePromise = nextJsonMessage(ws);
    threadHandler({
      cursor: 2,
      threadId: "thread-1",
      turnId: "turn-1",
      method: "turn.completed",
      payload: { text: "done" },
      createdAt: "2026-03-01T00:00:01.000Z"
    });
    const liveMessage = await liveMessagePromise;
    expect(liveMessage.method).toBe("turn.completed");
    expect(liveMessage.cursor).toBe(2);

    ws.close();
    await once(ws, "close");
    expect(unsubscribe.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("rejects thread stream upgrades without a session cookie", async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 404;
      response.end();
    });
    servers.add(server);

    attachThreadWebSocketGateway({
      server,
      authService: {
        readAuthMe: vi.fn()
      } as unknown as AuthService,
      threadService: {
        readThread: vi.fn()
      } as unknown as ThreadService,
      now: () => new Date("2026-03-01T00:00:00.000Z")
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not expose numeric address");
    }

    const ws = new WebSocket(
      `ws://127.0.0.1:${String(address.port)}/v1/threads/thread-1/stream?cursor=0`
    );
    sockets.add(ws);

    const statusCode = await new Promise<number>((resolve, reject) => {
      ws.once("unexpected-response", (_request, response) => {
        resolve(response.statusCode ?? 0);
      });
      ws.once("error", reject);
    });

    expect(statusCode).toBe(401);
  });

  it("rejects thread stream when auth access fails", async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 404;
      response.end();
    });
    servers.add(server);

    attachThreadWebSocketGateway({
      server,
      authService: {
        readAuthMe: vi.fn(async () => {
          throw new Error("forbidden");
        })
      } as unknown as AuthService,
      threadService: {
        readThread: vi.fn()
      } as unknown as ThreadService,
      now: () => new Date("2026-03-01T00:00:00.000Z")
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server did not expose numeric address");
    }

    const ws = new WebSocket(
      `ws://127.0.0.1:${String(address.port)}/v1/threads/thread-1/stream?cursor=0`,
      {
        headers: {
          cookie: "__Host-compass_session=session-token"
        }
      }
    );
    sockets.add(ws);

    const statusCode = await new Promise<number>((resolve, reject) => {
      ws.once("unexpected-response", (_request, response) => {
        resolve(response.statusCode ?? 0);
      });
      ws.once("error", reject);
    });

    expect(statusCode).toBe(403);
  });
});

describe("thread websocket parser", () => {
  it("parses valid thread stream requests", () => {
    const parsed = __internalThreadWebSocket.parseThreadStreamRequest({
      url: "/v1/threads/thread-1/stream?cursor=5"
    } as unknown as Parameters<typeof __internalThreadWebSocket.parseThreadStreamRequest>[0]);
    expect(parsed).toEqual({
      threadId: "thread-1",
      cursor: 5
    });
  });

  it("returns null for invalid thread stream urls", () => {
    const parsed = __internalThreadWebSocket.parseThreadStreamRequest({
      url: "/v1/threads//stream"
    } as unknown as Parameters<typeof __internalThreadWebSocket.parseThreadStreamRequest>[0]);
    expect(parsed).toBeNull();
  });

  it("parses runtime stream cursor as non-negative integer", () => {
    const withCursor = __internalThreadWebSocket.parseRuntimeStreamCursor({
      url: "/v1/runtime/stream?cursor=25"
    } as unknown as Parameters<typeof __internalThreadWebSocket.parseRuntimeStreamCursor>[0]);
    expect(withCursor).toBe(25);

    const withInvalidCursor = __internalThreadWebSocket.parseRuntimeStreamCursor({
      url: "/v1/runtime/stream?cursor=not-a-number"
    } as unknown as Parameters<typeof __internalThreadWebSocket.parseRuntimeStreamCursor>[0]);
    expect(withInvalidCursor).toBe(0);

    const withNegativeCursor = __internalThreadWebSocket.parseRuntimeStreamCursor({
      url: "/v1/runtime/stream?cursor=-50"
    } as unknown as Parameters<typeof __internalThreadWebSocket.parseRuntimeStreamCursor>[0]);
    expect(withNegativeCursor).toBe(0);
  });

  it("detects runtime stream route correctly", () => {
    expect(
      __internalThreadWebSocket.parseRuntimeStreamRequest({
        url: "/v1/runtime/stream"
      } as unknown as Parameters<typeof __internalThreadWebSocket.parseRuntimeStreamRequest>[0])
    ).toBe(true);
    expect(
      __internalThreadWebSocket.parseRuntimeStreamRequest({
        url: "/v1/threads/thread-1/stream"
      } as unknown as Parameters<typeof __internalThreadWebSocket.parseRuntimeStreamRequest>[0])
    ).toBe(false);
  });
});
