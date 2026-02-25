import { afterEach, describe, expect, it, vi } from "vitest";
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
    startOnBoot: false,
    entraClientId: undefined,
    entraClientSecret: undefined,
    entraRedirectUri: undefined,
    entraAllowedTenantIds: [],
    entraLoginEnabled: false,
    authDevFallbackEnabled: false
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

async function baseUrlFor(app: ReturnType<typeof buildCodexGatewayApp>): Promise<string> {
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve app address");
  }

  return `http://127.0.0.1:${address.port}`;
}

describe("gateway routes", () => {
  const apps: Array<ReturnType<typeof buildCodexGatewayApp>> = [];

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

    const app = buildCodexGatewayApp({ config: createConfig(), repository, gateway });
    apps.push(app);
    const baseUrl = await baseUrlFor(app);

    const response = await fetch(`${baseUrl}/v1/threads/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(201);
    expect(gatewayMocks.request).toHaveBeenCalledWith("thread/start", {});
    expect(repositoryMocks.upsertThread).toHaveBeenCalledWith({ id: "thr_1", status: "active" });
  });

  it("starts turns and maps payload to turn/start", async () => {
    const { repository, mocks: repositoryMocks } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();
    gatewayMocks.request.mockResolvedValue({
      turn: { id: "turn_1", status: "inProgress" }
    });

    const app = buildCodexGatewayApp({ config: createConfig(), repository, gateway });
    apps.push(app);
    const baseUrl = await baseUrlFor(app);

    const response = await fetch(`${baseUrl}/v1/threads/thr_1/turns/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "hello",
        model: "gpt-5-codex"
      })
    });

    expect(response.status).toBe(202);
    expect(gatewayMocks.request).toHaveBeenCalledWith(
      "turn/start",
      expect.objectContaining({
        threadId: "thr_1",
        model: "gpt-5-codex",
        input: [
          {
            type: "text",
            text: "hello"
          }
        ]
      })
    );
    expect(repositoryMocks.upsertTurn).toHaveBeenCalled();
  });

  it("returns 400 for invalid turn payload", async () => {
    const { repository } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();

    const app = buildCodexGatewayApp({ config: createConfig(), repository, gateway });
    apps.push(app);
    const baseUrl = await baseUrlFor(app);

    const response = await fetch(`${baseUrl}/v1/threads/thr_1/turns/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    expect(gatewayMocks.request).not.toHaveBeenCalled();
  });

  it("responds to approvals and maps overloaded RPC errors", async () => {
    const { repository } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();

    const app = buildCodexGatewayApp({ config: createConfig(), repository, gateway });
    apps.push(app);
    const baseUrl = await baseUrlFor(app);

    const accepted = await fetch(`${baseUrl}/v1/approvals/approval_1/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" })
    });

    expect(accepted.status).toBe(200);
    expect(gatewayMocks.respondApproval).toHaveBeenCalledWith("approval_1", "accept");

    gatewayMocks.request.mockRejectedValueOnce(new CodexRpcError(-32001, "Overloaded"));
    const overloaded = await fetch(`${baseUrl}/v1/threads/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });

    expect(overloaded.status).toBe(503);
  });

  it("handles auth and model endpoints", async () => {
    const { repository, mocks: repositoryMocks } = createRepository();
    const { gateway, mocks: gatewayMocks } = createGateway();

    gatewayMocks.request
      .mockResolvedValueOnce({ account: { type: "apiKey", email: "a@example.com" } })
      .mockResolvedValueOnce({ loginId: "login_123" })
      .mockResolvedValueOnce({ loginId: "login_chatgpt" })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ models: [] });

    const app = buildCodexGatewayApp({ config: createConfig(), repository, gateway });
    apps.push(app);
    const baseUrl = await baseUrlFor(app);

    const account = await fetch(`${baseUrl}/v1/auth/account`);
    expect(account.status).toBe(200);
    expect(repositoryMocks.upsertAuthState).toHaveBeenCalledWith("apiKey", {
      type: "apiKey",
      email: "a@example.com"
    });

    const apiKeyLogin = await fetch(`${baseUrl}/v1/auth/api-key/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-test" })
    });
    expect(apiKeyLogin.status).toBe(200);
    expect(gatewayMocks.request).toHaveBeenCalledWith("account/login/start", {
      type: "apiKey",
      apiKey: "sk-test"
    });

    const chatgptStart = await fetch(`${baseUrl}/v1/auth/chatgpt/login/start`, {
      method: "POST"
    });
    expect(chatgptStart.status).toBe(200);

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
    expect(gatewayMocks.request).toHaveBeenCalledWith("model/list", {
      includeHidden: true
    });
  });
});
