import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadListResponseSchema, ThreadReadResponseSchema } from "@compass/contracts";
import { buildCodexGatewayApp } from "../app.js";
import { CodexRpcError } from "../codex/jsonrpc.js";
import type { CodexGateway } from "../codex/gateway.js";
import type { CodexAppConfig } from "../config/index.js";
import type { PersistenceRepository } from "../storage/repository.js";

function createConfig(): CodexAppConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 3010,
    logLevel: "silent",
    databaseUrl: undefined,
    codexBinPath: "codex",
    codexHome: "/tmp/codex-home",
    serviceApiKey: undefined,
    clientName: "compass_codex_gateway",
    clientVersion: "0.1.0",
    startOnBoot: false
  };
}

function createRepository() {
  const mocks = {
    upsertThread: vi.fn(async () => {}),
    upsertTurn: vi.fn(async () => {}),
    upsertItem: vi.fn(async () => {}),
    insertEvent: vi.fn(async () => {}),
    listThreads: vi.fn(async () => []),
    readThread: vi.fn(async () => null),
    insertApproval: vi.fn(async () => {}),
    resolveApproval: vi.fn(async () => {}),
    upsertAuthState: vi.fn(async () => {}),
    close: vi.fn(async () => {})
  };

  return {
    repository: mocks as unknown as PersistenceRepository,
    mocks
  };
}

function createGateway() {
  const mocks = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    request: vi.fn(async () => ({})),
    respondApproval: vi.fn(async () => {})
  };

  return {
    gateway: mocks as unknown as CodexGateway,
    mocks
  };
}

describe("gateway routes", () => {
  const apps: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    for (const app of apps) {
      await app.close();
    }
    apps.length = 0;
  });

  it("starts a thread and persists it", async () => {
    const { repository, mocks: repositoryMocks } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();
    gatewayMocks.request.mockResolvedValue({
      thread: { id: "thr_1", status: "active" }
    });

    const app = buildCodexGatewayApp({
      config: createConfig(),
      repository,
      gateway
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/threads/start",
      payload: {}
    });

    expect(response.statusCode).toBe(201);
    expect(gatewayMocks.request).toHaveBeenCalledWith("thread/start", {});
    expect(repositoryMocks.upsertThread).toHaveBeenCalledWith({ id: "thr_1", status: "active" });
  });

  it("maps codex overload errors to 503", async () => {
    const { repository } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();
    gatewayMocks.request.mockRejectedValue(new CodexRpcError(-32001, "Overloaded"));

    const app = buildCodexGatewayApp({
      config: createConfig(),
      repository,
      gateway
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/threads/start",
      payload: {}
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      code: "RPC_-32001",
      message: "Overloaded"
    });
  });

  it("rejects invalid turn start payloads via shared schema", async () => {
    const { repository } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();
    const app = buildCodexGatewayApp({
      config: createConfig(),
      repository,
      gateway
    });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/threads/thr_1/turns/start",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(gatewayMocks.request).not.toHaveBeenCalled();
  });

  it("lists threads using contract response shape", async () => {
    const { repository, mocks: repositoryMocks } = createRepository();
    repositoryMocks.listThreads.mockResolvedValue([
      {
        threadId: "thr_1",
        title: "Thread 1",
        status: "active",
        model: null,
        cwd: null,
        archived: false,
        createdAt: "2026-02-24T00:00:00.000Z",
        updatedAt: "2026-02-24T00:00:00.000Z",
        metadata: {}
      }
    ]);
    const { gateway } = createGateway();
    const app = buildCodexGatewayApp({
      config: createConfig(),
      repository,
      gateway
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/threads?limit=20"
    });

    expect(response.statusCode).toBe(200);
    expect(ThreadListResponseSchema.parse(response.json()).data).toHaveLength(1);
  });

  it("returns 404 for missing threads and validates thread read shape", async () => {
    const { repository, mocks: repositoryMocks } = createRepository();
    const { gateway } = createGateway();
    const app = buildCodexGatewayApp({
      config: createConfig(),
      repository,
      gateway
    });
    apps.push(app);

    const missing = await app.inject({
      method: "GET",
      url: "/v1/threads/not_found"
    });

    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("THREAD_NOT_FOUND");

    repositoryMocks.readThread.mockResolvedValue({
      thread: { threadId: "thr_1" },
      turns: [],
      items: [],
      approvals: [],
      events: []
    });

    const found = await app.inject({
      method: "GET",
      url: "/v1/threads/thr_1"
    });

    expect(found.statusCode).toBe(200);
    expect(ThreadReadResponseSchema.parse(found.json()).thread).toEqual({ threadId: "thr_1" });
  });

  it("responds to approvals and enforces status mapping", async () => {
    const { repository } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();
    const app = buildCodexGatewayApp({
      config: createConfig(),
      repository,
      gateway
    });
    apps.push(app);

    const accepted = await app.inject({
      method: "POST",
      url: "/v1/approvals/approval_1/respond",
      payload: {
        decision: "accept"
      }
    });

    expect(accepted.statusCode).toBe(200);
    expect(gatewayMocks.respondApproval).toHaveBeenCalledWith("approval_1", "accept");

    gatewayMocks.respondApproval.mockRejectedValue(new CodexRpcError(-32602, "Bad request"));

    const rejected = await app.inject({
      method: "POST",
      url: "/v1/approvals/approval_1/respond",
      payload: {
        decision: "decline"
      }
    });

    expect(rejected.statusCode).toBe(500);
  });

  it("passes includeHidden to model/list and tracks auth state updates", async () => {
    const { repository, mocks: repositoryMocks } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();
    gatewayMocks.request
      .mockResolvedValueOnce({
        account: {
          type: "apiKey"
        }
      })
      .mockResolvedValueOnce({
        models: []
      });

    const app = buildCodexGatewayApp({
      config: createConfig(),
      repository,
      gateway
    });
    apps.push(app);

    const authResponse = await app.inject({
      method: "GET",
      url: "/v1/auth/account"
    });
    expect(authResponse.statusCode).toBe(200);
    expect(repositoryMocks.upsertAuthState).toHaveBeenCalledWith("apiKey", { type: "apiKey" });

    const models = await app.inject({
      method: "GET",
      url: "/v1/models?includeHidden=true"
    });
    expect(models.statusCode).toBe(200);
    expect(gatewayMocks.request).toHaveBeenCalledWith("model/list", { includeHidden: true });
  });
});
