import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import WebSocket, { type RawData } from "ws";
import {
  StreamEventSchema,
  ThreadListResponseSchema,
  ThreadReadResponseSchema
} from "@compass/contracts";
import type { FastifyInstance } from "fastify";
import { buildCodexGatewayApp } from "../../src/app.js";
import type { CodexAppConfig } from "../../src/config/index.js";
import { CodexGateway } from "../../src/codex/gateway.js";
import { WebSocketHub } from "../../src/realtime/ws-hub.js";
import { PostgresRepository } from "../../src/storage/repository.js";
import { FakeCodexServer } from "./fixtures/fake-codex-server.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for codex gateway integration tests");
}

const LOG_SILENT = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {}
};

function createConfig(startOnBoot = true): CodexAppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 3010,
    logLevel: "silent",
    databaseUrl,
    codexBinPath: "codex",
    codexHome: "/tmp/compass-codex-test",
    serviceApiKey: undefined,
    clientName: "compass_codex_gateway_test",
    clientVersion: "0.1.0",
    startOnBoot,
    entraClientId: undefined,
    entraClientSecret: undefined,
    entraRedirectUri: undefined,
    entraAllowedTenantIds: [],
    entraLoginEnabled: false,
    authDevFallbackEnabled: false
  };
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 4_000
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  throw new Error("Timed out waiting for condition");
}

async function connectWs(url: string, timeoutMs = 2_000): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timed out connecting websocket ${url}`));
    }, timeoutMs);

    ws.once("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function rawDataToString(message: RawData): string {
  if (typeof message === "string") {
    return message;
  }

  if (Buffer.isBuffer(message)) {
    return message.toString("utf8");
  }

  if (Array.isArray(message)) {
    return Buffer.concat(message).toString("utf8");
  }

  return Buffer.from(message).toString("utf8");
}

describe("codex gateway integration", () => {
  const directDb = new Client({ connectionString: databaseUrl });
  const apps: FastifyInstance[] = [];

  beforeAll(async () => {
    await directDb.connect();
  });

  beforeEach(async () => {
    await directDb.query(`
      truncate table
        codex_events,
        codex_approvals,
        codex_items,
        codex_turns,
        codex_threads,
        codex_auth_state
      restart identity cascade
    `);
    await directDb.query(`
      insert into codex_auth_state (auth_state_id, auth_mode, account, updated_at)
      values ('global', null, '{}'::jsonb, now())
    `);
  });

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  afterAll(async () => {
    await directDb.end();
  });

  it("performs initialize + initialized handshake on startup", async () => {
    const fakeCodex = new FakeCodexServer();
    const repository = new PostgresRepository(databaseUrl);
    const hub = new WebSocketHub();
    const gateway = new CodexGateway({
      config: createConfig(true),
      repository,
      hub,
      logger: LOG_SILENT,
      spawnFn: fakeCodex.spawnFn
    });

    const app = buildCodexGatewayApp({
      config: createConfig(true),
      repository,
      gateway,
      wsHub: hub
    });
    apps.push(app);

    await app.ready();

    await fakeCodex.waitFor((messages) => {
      const methods = messages
        .map((entry) => {
          const record = entry.message as Record<string, unknown>;
          return typeof record.method === "string" ? record.method : null;
        })
        .filter((value): value is string => Boolean(value));
      return methods.includes("initialize") && methods.includes("initialized");
    });

    const handshakeMethods = fakeCodex.receivedMessages
      .map((entry) => {
        const record = entry.message as Record<string, unknown>;
        return typeof record.method === "string" ? record.method : null;
      })
      .filter((value): value is string => Boolean(value))
      .slice(0, 2);

    expect(handshakeMethods).toEqual(["initialize", "initialized"]);
  });

  it("persists thread-turn-item-event lifecycle through routes + notifications", async () => {
    const fakeCodex = new FakeCodexServer();
    const repository = new PostgresRepository(databaseUrl);
    const hub = new WebSocketHub();

    fakeCodex.onRequest("thread/start", ({ id, processId, server }) => {
      server.respond(processId, id, {
        thread: {
          id: "thr_int_1",
          status: "active",
          model: "gpt-5-codex",
          name: "Integration thread"
        }
      });
    });

    fakeCodex.onRequest("turn/start", ({ id, processId, server }) => {
      server.respond(processId, id, {
        turn: {
          id: "turn_int_1",
          status: "inProgress"
        }
      });

      server.notify("turn/started", {
        threadId: "thr_int_1",
        turnId: "turn_int_1",
        turn: {
          id: "turn_int_1",
          status: "inProgress"
        }
      });
      server.notify("item/started", {
        threadId: "thr_int_1",
        turnId: "turn_int_1",
        item: {
          id: "item_int_1",
          type: "message",
          status: "inProgress"
        }
      });
      server.notify("item/contentDelta", {
        threadId: "thr_int_1",
        turnId: "turn_int_1",
        item: {
          id: "item_int_1"
        },
        delta: "hello"
      });
      server.notify("item/completed", {
        threadId: "thr_int_1",
        turnId: "turn_int_1",
        item: {
          id: "item_int_1",
          type: "message",
          status: "completed"
        }
      });
      server.notify("turn/completed", {
        threadId: "thr_int_1",
        turnId: "turn_int_1",
        turn: {
          id: "turn_int_1",
          status: "completed"
        }
      });
    });

    const gateway = new CodexGateway({
      config: createConfig(true),
      repository,
      hub,
      logger: LOG_SILENT,
      spawnFn: fakeCodex.spawnFn
    });

    const app = buildCodexGatewayApp({
      config: createConfig(true),
      repository,
      gateway,
      wsHub: hub
    });
    apps.push(app);

    await app.ready();

    const threadStart = await app.inject({
      method: "POST",
      url: "/v1/threads/start",
      payload: {}
    });
    expect(threadStart.statusCode).toBe(201);

    const turnStart = await app.inject({
      method: "POST",
      url: "/v1/threads/thr_int_1/turns/start",
      payload: {
        text: "hello from integration"
      }
    });
    expect(turnStart.statusCode).toBe(202);

    await waitFor(async () => {
      const result = await directDb.query(
        "select count(*)::int as count from codex_events where thread_id = 'thr_int_1'"
      );
      return Number(result.rows[0]?.count) >= 5;
    });

    const threadCount = await directDb.query(
      "select count(*)::int as count from codex_threads where thread_id = 'thr_int_1'"
    );
    const turnCount = await directDb.query(
      "select count(*)::int as count from codex_turns where turn_id = 'turn_int_1'"
    );
    const itemCount = await directDb.query(
      "select count(*)::int as count from codex_items where item_id = 'item_int_1'"
    );

    expect(threadCount.rows[0]?.count).toBe(1);
    expect(turnCount.rows[0]?.count).toBe(1);
    expect(itemCount.rows[0]?.count).toBe(1);

    const threadRead = await app.inject({
      method: "GET",
      url: "/v1/threads/thr_int_1"
    });
    expect(threadRead.statusCode).toBe(200);
    const payload = ThreadReadResponseSchema.parse(threadRead.json());
    expect(payload.turns).toHaveLength(1);
    expect(payload.items).toHaveLength(1);
    expect(payload.events.length).toBeGreaterThanOrEqual(5);

    const list = await app.inject({
      method: "GET",
      url: "/v1/threads?limit=10"
    });
    expect(list.statusCode).toBe(200);
    const listPayload = ThreadListResponseSchema.parse(list.json());
    expect(listPayload.data.some((thread) => thread.threadId === "thr_int_1")).toBe(true);
  });

  it("handles approval request/response and enforces one response per request id", async () => {
    const fakeCodex = new FakeCodexServer();
    const repository = new PostgresRepository(databaseUrl);
    const hub = new WebSocketHub();

    fakeCodex.onRequest("thread/start", ({ id, processId, server }) => {
      server.respond(processId, id, {
        thread: {
          id: "thr_appr_1",
          status: "active"
        }
      });
    });

    const gateway = new CodexGateway({
      config: createConfig(true),
      repository,
      hub,
      logger: LOG_SILENT,
      spawnFn: fakeCodex.spawnFn
    });

    const app = buildCodexGatewayApp({
      config: createConfig(true),
      repository,
      gateway,
      wsHub: hub
    });
    apps.push(app);

    await app.ready();

    const threadStart = await app.inject({
      method: "POST",
      url: "/v1/threads/start",
      payload: {}
    });
    expect(threadStart.statusCode).toBe(201);

    const requestId = fakeCodex.request("item/commandExecution/requestApproval", {
      threadId: "thr_appr_1",
      turnId: "turn_appr_1",
      itemId: "item_appr_1",
      reason: "Allow command execution?"
    });

    await waitFor(async () => {
      const approval = await directDb.query(
        "select count(*)::int as count from codex_approvals where request_id = $1",
        [requestId]
      );
      return approval.rows[0]?.count === 1;
    });

    const firstResponsePromise = fakeCodex.waitForServerResponse(requestId);
    const first = await app.inject({
      method: "POST",
      url: `/v1/approvals/${requestId}/respond`,
      payload: {
        decision: "accept"
      }
    });
    expect(first.statusCode).toBe(200);

    const rpcResponse = await firstResponsePromise;
    expect(rpcResponse.result).toEqual({ decision: "accept" });

    const duplicate = await app.inject({
      method: "POST",
      url: `/v1/approvals/${requestId}/respond`,
      payload: {
        decision: "accept"
      }
    });
    expect(duplicate.statusCode).toBe(500);

    const approval = await directDb.query(
      "select status, decision from codex_approvals where request_id = $1",
      [requestId]
    );
    expect(approval.rows[0]?.status).toBe("resolved");
    expect(approval.rows[0]?.decision).toBe("accept");
  });

  it("retries on -32001 overload and succeeds on a later attempt", async () => {
    const fakeCodex = new FakeCodexServer();
    const repository = new PostgresRepository(databaseUrl);
    const hub = new WebSocketHub();
    let attemptCount = 0;

    fakeCodex.onRequest("thread/start", ({ id, processId, server }) => {
      attemptCount += 1;
      if (attemptCount < 3) {
        server.respondError(processId, id, {
          code: -32001,
          message: "Server overloaded"
        });
        return;
      }

      server.respond(processId, id, {
        thread: {
          id: "thr_retry_1",
          status: "active"
        }
      });
    });

    const gateway = new CodexGateway({
      config: createConfig(true),
      repository,
      hub,
      logger: LOG_SILENT,
      spawnFn: fakeCodex.spawnFn
    });

    const app = buildCodexGatewayApp({
      config: createConfig(true),
      repository,
      gateway,
      wsHub: hub
    });
    apps.push(app);

    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/v1/threads/start",
      payload: {}
    });

    expect(response.statusCode).toBe(201);
    expect(attemptCount).toBe(3);
  });

  it("restarts the codex process after exit and recovers on subsequent requests", async () => {
    const fakeCodex = new FakeCodexServer();
    const repository = new PostgresRepository(databaseUrl);
    const hub = new WebSocketHub();

    fakeCodex.onRequest("thread/start", ({ id, processId, server }) => {
      server.respond(processId, id, {
        thread: {
          id: `thr_restart_${processId}`,
          status: "active"
        }
      });
    });

    const gateway = new CodexGateway({
      config: createConfig(true),
      repository,
      hub,
      logger: LOG_SILENT,
      spawnFn: fakeCodex.spawnFn
    });

    const app = buildCodexGatewayApp({
      config: createConfig(true),
      repository,
      gateway,
      wsHub: hub
    });
    apps.push(app);

    await app.ready();

    const first = await app.inject({
      method: "POST",
      url: "/v1/threads/start",
      payload: {}
    });
    expect(first.statusCode).toBe(201);
    expect(fakeCodex.spawnCount).toBe(1);

    fakeCodex.exitProcess(1, 1);

    await waitFor(() => fakeCodex.spawnCount >= 2, 8_000);

    const second = await app.inject({
      method: "POST",
      url: "/v1/threads/start",
      payload: {}
    });
    expect(second.statusCode).toBe(201);
    const secondPayload = second.json<{ thread: { id: string } }>();
    expect(secondPayload.thread.id).toBe("thr_restart_2");
  });

  it("persists auth state for account/read, account/updated notifications, and logout", async () => {
    const fakeCodex = new FakeCodexServer();
    const repository = new PostgresRepository(databaseUrl);
    const hub = new WebSocketHub();

    fakeCodex.onRequest("account/read", ({ id, processId, server }) => {
      server.respond(processId, id, {
        account: {
          type: "apiKey",
          email: "operator@example.com"
        }
      });
    });

    fakeCodex.onRequest("account/login/start", ({ id, params, processId, server }) => {
      const payload = (params ?? {}) as Record<string, unknown>;
      if (payload.type === "chatgpt") {
        server.respond(processId, id, {
          loginId: "chatgpt_login_1",
          authUrl: "https://example.invalid/login"
        });
        return;
      }

      server.respond(processId, id, {
        ok: true
      });
    });

    fakeCodex.onRequest("account/login/cancel", ({ id, processId, server }) => {
      server.respond(processId, id, { ok: true });
    });

    fakeCodex.onRequest("account/logout", ({ id, processId, server }) => {
      server.respond(processId, id, { ok: true });
    });

    const gateway = new CodexGateway({
      config: createConfig(true),
      repository,
      hub,
      logger: LOG_SILENT,
      spawnFn: fakeCodex.spawnFn
    });

    const app = buildCodexGatewayApp({
      config: createConfig(true),
      repository,
      gateway,
      wsHub: hub
    });
    apps.push(app);

    await app.ready();

    const apiKeyLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/api-key/login",
      payload: {
        apiKey: "sk-test-key"
      }
    });
    expect(apiKeyLogin.statusCode).toBe(200);

    const chatgptLogin = await app.inject({
      method: "POST",
      url: "/v1/auth/chatgpt/login/start",
      payload: {}
    });
    expect(chatgptLogin.statusCode).toBe(200);

    const chatgptCancel = await app.inject({
      method: "POST",
      url: "/v1/auth/chatgpt/login/cancel",
      payload: {
        loginId: "chatgpt_login_1"
      }
    });
    expect(chatgptCancel.statusCode).toBe(200);

    const account = await app.inject({
      method: "GET",
      url: "/v1/auth/account"
    });
    expect(account.statusCode).toBe(200);

    const authAfterRead = await directDb.query(
      "select auth_mode from codex_auth_state where auth_state_id = 'global'"
    );
    expect(authAfterRead.rows[0]?.auth_mode).toBe("apiKey");

    fakeCodex.notify("account/updated", {
      authMode: "chatgpt",
      account: {
        type: "chatgpt",
        email: "operator@example.com"
      }
    });

    await waitFor(async () => {
      const auth = await directDb.query(
        "select auth_mode from codex_auth_state where auth_state_id = 'global'"
      );
      return auth.rows[0]?.auth_mode === "chatgpt";
    });

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      payload: {}
    });
    expect(logout.statusCode).toBe(200);

    const authAfterLogout = await directDb.query(
      "select auth_mode from codex_auth_state where auth_state_id = 'global'"
    );
    expect(authAfterLogout.rows[0]?.auth_mode).toBeNull();
  });

  it("streams websocket events only to matching thread subscribers", async () => {
    const fakeCodex = new FakeCodexServer();
    const repository = new PostgresRepository(databaseUrl);
    const hub = new WebSocketHub();

    const gateway = new CodexGateway({
      config: createConfig(false),
      repository,
      hub,
      logger: LOG_SILENT,
      spawnFn: fakeCodex.spawnFn
    });

    const app = buildCodexGatewayApp({
      config: createConfig(false),
      repository,
      gateway,
      wsHub: hub
    });
    apps.push(app);

    await app.listen({ host: "127.0.0.1", port: 0 });

    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    const wsThreadA = await connectWs(`ws://127.0.0.1:${address.port}/v1/stream?threadId=thr_A`);
    const wsThreadB = await connectWs(`ws://127.0.0.1:${address.port}/v1/stream?threadId=thr_B`);

    const messagesA: unknown[] = [];
    const messagesB: unknown[] = [];

    try {
      wsThreadA.on("message", (message) => {
        const parsed = JSON.parse(rawDataToString(message));
        messagesA.push(StreamEventSchema.parse(parsed));
      });

      wsThreadB.on("message", (message) => {
        const parsed = JSON.parse(rawDataToString(message));
        messagesB.push(StreamEventSchema.parse(parsed));
      });

      hub.broadcast("thr_A", {
        type: "thread.started",
        method: "thread/started",
        payload: {
          threadId: "thr_A"
        }
      });
      hub.broadcast("thr_B", {
        type: "thread.started",
        method: "thread/started",
        payload: {
          threadId: "thr_B"
        }
      });

      await waitFor(() => messagesA.length >= 1 && messagesB.length >= 1);

      const threadAIds = messagesA
        .map((event) => (event as { payload?: { threadId?: string } }).payload?.threadId)
        .filter((value): value is string => typeof value === "string");
      const threadBIds = messagesB
        .map((event) => (event as { payload?: { threadId?: string } }).payload?.threadId)
        .filter((value): value is string => typeof value === "string");

      expect(threadAIds).toEqual(["thr_A"]);
      expect(threadBIds).toEqual(["thr_B"]);
    } finally {
      wsThreadA.terminate();
      wsThreadB.terminate();
    }
  });
});
