import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const closeAuth = vi.fn(async () => {});
  const closeAgent = vi.fn(async () => {});
  const serverClose = vi.fn((callback?: () => void) => {
    callback?.();
  });
  const serverListen = vi.fn((_port: number, _host: string, callback?: () => void) => {
    callback?.();
  });
  const createServer = vi.fn(() => ({
    listen: serverListen,
    close: serverClose
  }));
  const attachGateway = vi.fn();
  const buildApiApp = vi.fn(() => ({ mocked: true }));
  const buildDefaultAuthService = vi.fn(() => ({
    service: { auth: "service" },
    close: closeAuth
  }));
  const buildDefaultAgentService = vi.fn(() => ({
    service: { agent: "service" },
    close: closeAgent
  }));
  const existsSync = vi.fn(() => false);
  const loadEnvFile = vi.fn();
  const requireDatabaseUrl = vi.fn(
    (value: string | undefined) => value ?? "postgres://local:test@127.0.0.1:5432/compass"
  );
  const verifyDatabaseReadiness = vi.fn(async () => {});
  const loadApiConfig = vi.fn(() => ({
    host: "127.0.0.1",
    port: 3101,
    authMode: "mock",
    databaseUrl: "postgres://local:test@127.0.0.1:5432/compass"
  }));

  return {
    closeAuth,
    closeAgent,
    serverClose,
    serverListen,
    createServer,
    attachGateway,
    buildApiApp,
    buildDefaultAuthService,
    buildDefaultAgentService,
    existsSync,
    loadEnvFile,
    requireDatabaseUrl,
    verifyDatabaseReadiness,
    loadApiConfig
  };
});

vi.mock("node:fs", () => ({
  existsSync: mocks.existsSync
}));

vi.mock("node:process", async () => {
  const actual = await vi.importActual("node:process");
  return {
    ...actual,
    loadEnvFile: mocks.loadEnvFile
  };
});

vi.mock("node:http", () => ({
  createServer: mocks.createServer
}));

vi.mock("../../src/config.js", () => ({
  loadApiConfig: mocks.loadApiConfig
}));

vi.mock("../../src/app.js", () => ({
  buildApiApp: mocks.buildApiApp
}));

vi.mock("../../src/auth-service.js", () => ({
  buildDefaultAuthService: mocks.buildDefaultAuthService
}));

vi.mock("../../src/agent-service.js", () => ({
  buildDefaultAgentService: mocks.buildDefaultAgentService
}));

vi.mock("../../src/agent-websocket.js", () => ({
  attachAgentWebSocketGateway: mocks.attachGateway
}));

vi.mock("../../src/startup-env.js", () => ({
  requireDatabaseUrl: mocks.requireDatabaseUrl,
  verifyDatabaseReadiness: mocks.verifyDatabaseReadiness
}));

describe("API entrypoint", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("boots server and shuts down auth/agent services on termination signal", async () => {
    const signalHandlers = new Map<string, () => void>();
    const onSpy = vi.spyOn(process, "on").mockImplementation(((
      event: string | symbol,
      listener: (...args: unknown[]) => void
    ) => {
      signalHandlers.set(String(event), listener as () => void);
      return process;
    }) as typeof process.on);

    try {
      await import("../../src/index.js");

      expect(mocks.loadApiConfig).toHaveBeenCalledTimes(1);
      expect(mocks.requireDatabaseUrl).toHaveBeenCalledTimes(1);
      expect(mocks.verifyDatabaseReadiness).toHaveBeenCalledTimes(1);
      expect(mocks.buildDefaultAuthService).toHaveBeenCalledTimes(1);
      expect(mocks.buildDefaultAgentService).toHaveBeenCalledTimes(1);
      expect(mocks.buildApiApp).toHaveBeenCalledTimes(1);
      expect(mocks.createServer).toHaveBeenCalledTimes(1);
      expect(mocks.attachGateway).toHaveBeenCalledTimes(1);
      expect(mocks.serverListen).toHaveBeenCalledWith(3101, "127.0.0.1", expect.any(Function));
      expect(signalHandlers.has("SIGINT")).toBe(true);
      expect(signalHandlers.has("SIGTERM")).toBe(true);
    } finally {
      onSpy.mockRestore();
    }
  });
});
