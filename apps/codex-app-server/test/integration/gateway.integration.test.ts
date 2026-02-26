import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { type RawData } from "ws";
import { StreamEventSchema } from "@compass/contracts";
import { buildCodexGatewayApp } from "../../src/app.js";
import type { CodexAppConfig } from "../../src/config/index.js";
import { CodexGateway } from "../../src/codex/gateway.js";
import { WebSocketHub } from "../../src/realtime/ws-hub.js";
import { InMemoryRepository } from "../../src/storage/repository.js";
import { FakeCodexServer } from "./fixtures/fake-codex-server.js";

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
    databaseUrl: undefined,
    codexBinPath: "codex",
    codexHome: "/tmp/compass-codex-test",
    serviceApiKey: undefined,
    clientName: "compass_codex_gateway_test",
    clientVersion: "0.1.0",
    startOnBoot,
    entraClientId: undefined,
    entraClientSecret: undefined,
    entraRedirectUri: undefined,
    entraAllowedTenantIds: []
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

async function nextStreamEvent(ws: WebSocket, timeoutMs = 4_000) {
  return new Promise<ReturnType<typeof StreamEventSchema.parse>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      ws.off("error", onError);
      reject(new Error("Timed out waiting for websocket event"));
    }, timeoutMs);

    const onError = (error: Error) => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("error", onError);
      reject(error);
    };

    const onMessage = (message: RawData) => {
      try {
        const event = StreamEventSchema.parse(JSON.parse(rawDataToString(message)));
        clearTimeout(timeout);
        ws.off("message", onMessage);
        ws.off("error", onError);
        resolve(event);
      } catch {
        // Ignore non-matching payloads.
      }
    };

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

async function closeWebSocket(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket close"));
    }, 2_000);

    socket.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.close(1000, "integration-test");
  });
}

async function listenOnRandomPort(app: ReturnType<typeof buildCodexGatewayApp>): Promise<string> {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve server address");
  }

  return `http://127.0.0.1:${address.port}`;
}

describe("codex gateway integration smoke", () => {
  const apps: Array<ReturnType<typeof buildCodexGatewayApp>> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  it("performs initialize + initialized handshake on startup", async () => {
    const fakeCodex = new FakeCodexServer();
    const repository = new InMemoryRepository();
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

    await listenOnRandomPort(app);

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

  it("starts codex lazily when startOnBoot is disabled", async () => {
    const fakeCodex = new FakeCodexServer();
    fakeCodex.onRequest("model/list", ({ id, processId, server }) => {
      server.respond(processId, id, { models: [] });
    });

    const repository = new InMemoryRepository();
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

    const baseUrl = await listenOnRandomPort(app);
    expect(fakeCodex.spawnCount).toBe(0);

    const response = await fetch(`${baseUrl}/v1/models`);
    expect(response.status).toBe(200);

    await waitFor(() => fakeCodex.spawnCount === 1);
  });

  it("streams turn events and supports turn interrupt", async () => {
    const fakeCodex = new FakeCodexServer();

    fakeCodex.onRequest("thread/start", ({ id, processId, server }) => {
      server.respond(processId, id, {
        thread: {
          id: "thr_stream_1",
          status: "active"
        }
      });
    });

    fakeCodex.onRequest("turn/start", ({ id, processId, server }) => {
      server.respond(processId, id, {
        turn: {
          id: "turn_stream_1",
          status: "inProgress"
        }
      });

      server.notify("turn/started", {
        threadId: "thr_stream_1",
        turnId: "turn_stream_1",
        turn: {
          id: "turn_stream_1",
          status: "inProgress"
        }
      });
    });

    fakeCodex.onRequest("turn/interrupt", ({ id, processId, server }) => {
      server.respond(processId, id, {});
    });

    const repository = new InMemoryRepository();
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

    const baseUrl = await listenOnRandomPort(app);
    const ws = await connectWs(`${baseUrl.replace("http", "ws")}/v1/stream?threadId=thr_stream_1`);

    const threadStart = await fetch(`${baseUrl}/v1/threads/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(threadStart.status).toBe(201);

    const streamEventPromise = nextStreamEvent(ws);
    const turnStart = await fetch(`${baseUrl}/v1/threads/thr_stream_1/turns/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" })
    });
    expect(turnStart.status).toBe(202);

    const event = await streamEventPromise;
    expect(event.type).toBe("turn.started");

    const interrupt = await fetch(
      `${baseUrl}/v1/threads/thr_stream_1/turns/turn_stream_1/interrupt`,
      {
        method: "POST"
      }
    );
    expect(interrupt.status).toBe(202);
    expect(await interrupt.json()).toEqual({ ok: true });

    expect(
      fakeCodex.receivedMessages.some((entry) => {
        const record = entry.message as Record<string, unknown>;
        return record.method === "turn/interrupt";
      })
    ).toBe(true);

    await closeWebSocket(ws);
  });

  it("handles approval requests and allows a single response", async () => {
    const fakeCodex = new FakeCodexServer();
    fakeCodex.onRequest("thread/start", ({ id, processId, server }) => {
      server.respond(processId, id, {
        thread: {
          id: "thr_appr_1",
          status: "active"
        }
      });
    });

    const repository = new InMemoryRepository();
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

    const baseUrl = await listenOnRandomPort(app);
    const ws = await connectWs(`${baseUrl.replace("http", "ws")}/v1/stream?threadId=thr_appr_1`);

    const threadStart = await fetch(`${baseUrl}/v1/threads/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    expect(threadStart.status).toBe(201);

    const requestId = fakeCodex.request("item/commandExecution/requestApproval", {
      threadId: "thr_appr_1",
      turnId: "turn_appr_1",
      itemId: "item_appr_1",
      reason: "Allow command execution?"
    });

    const requestedEvent = await nextStreamEvent(ws);
    expect(requestedEvent.type).toBe("approval.requested");

    const firstResponsePromise = fakeCodex.waitForServerResponse(requestId);
    const accepted = await fetch(`${baseUrl}/v1/approvals/${requestId}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" })
    });
    expect(accepted.status).toBe(200);

    const rpcResponse = await firstResponsePromise;
    expect(rpcResponse.result).toEqual({ decision: "accept" });

    const duplicate = await fetch(`${baseUrl}/v1/approvals/${requestId}/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" })
    });
    expect(duplicate.status).toBe(500);

    await closeWebSocket(ws);
  });

  it("supports account read, login, logout, and model listing", async () => {
    const fakeCodex = new FakeCodexServer();
    fakeCodex.onRequest("account/read", ({ id, processId, server }) => {
      server.respond(processId, id, {
        account: {
          type: "apiKey",
          email: "dev@example.com"
        }
      });
    });

    fakeCodex.onRequest("account/login/start", ({ id, processId, server, params }) => {
      const type = (params as Record<string, unknown>)?.type;
      server.respond(processId, id, {
        loginId: type === "chatgpt" ? "login_chatgpt" : "login_api_key"
      });
    });

    fakeCodex.onRequest("account/login/cancel", ({ id, processId, server }) => {
      server.respond(processId, id, { ok: true });
    });

    fakeCodex.onRequest("account/logout", ({ id, processId, server }) => {
      server.respond(processId, id, {});
    });

    fakeCodex.onRequest("model/list", ({ id, processId, server }) => {
      server.respond(processId, id, { models: [] });
    });

    const repository = new InMemoryRepository();
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

    const baseUrl = await listenOnRandomPort(app);

    const account = await fetch(`${baseUrl}/v1/auth/account`);
    expect(account.status).toBe(200);

    const apiKeyLogin = await fetch(`${baseUrl}/v1/auth/api-key/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-test" })
    });
    expect(apiKeyLogin.status).toBe(200);

    const chatgptLogin = await fetch(`${baseUrl}/v1/auth/chatgpt/login/start`, {
      method: "POST"
    });
    expect(chatgptLogin.status).toBe(200);

    const chatgptCancel = await fetch(`${baseUrl}/v1/auth/chatgpt/login/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginId: "login_chatgpt" })
    });
    expect(chatgptCancel.status).toBe(200);

    const logout = await fetch(`${baseUrl}/v1/auth/logout`, {
      method: "POST"
    });
    expect(logout.status).toBe(200);

    const models = await fetch(`${baseUrl}/v1/models?includeHidden=true`);
    expect(models.status).toBe(200);

    expect(
      fakeCodex.receivedMessages.some((entry) => {
        const record = entry.message as Record<string, unknown>;
        if (record.method !== "model/list") {
          return false;
        }
        const params = record.params as Record<string, unknown>;
        return params.includeHidden === true;
      })
    ).toBe(true);
  });
});
