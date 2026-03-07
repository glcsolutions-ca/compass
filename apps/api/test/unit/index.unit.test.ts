import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const closeAuth = vi.fn(async () => {});
  const closeAgent = vi.fn(async () => {});
  const closeSessionControlPlane = vi.fn(() => {});
  const serverClose = vi.fn((callback?: () => void) => {
    callback?.();
  });
  const serverListen = vi.fn((_port: number, _host: string, callback?: () => void) => {
    callback?.();
  });
  const serverOn = vi.fn();
  const createServer = vi.fn(() => ({
    listen: serverListen,
    close: serverClose,
    on: serverOn
  }));
  const attachGateway = vi.fn();
  const attachSessionAgentGateway = vi.fn();
  const buildApiApp = vi.fn(() => ({ mocked: true }));
  const buildDefaultAuthService = vi.fn(() => ({
    service: { auth: "service" },
    close: closeAuth
  }));
  const buildDefaultThreadService = vi.fn(() => ({
    service: { agent: "service" },
    close: closeAgent
  }));
  const buildDefaultSessionControlPlane = vi.fn(() => ({
    close: closeSessionControlPlane
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
    closeSessionControlPlane,
    serverClose,
    serverListen,
    serverOn,
    createServer,
    attachGateway,
    attachSessionAgentGateway,
    buildApiApp,
    buildDefaultAuthService,
    buildDefaultThreadService,
    buildDefaultSessionControlPlane,
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

vi.mock("../../src/bootstrap/config.js", () => ({
  loadApiConfig: mocks.loadApiConfig
}));

vi.mock("../../src/http/build-app.js", () => ({
  buildApiApp: mocks.buildApiApp
}));

vi.mock("../../src/modules/auth/auth-service.js", () => ({
  buildDefaultAuthService: mocks.buildDefaultAuthService
}));

vi.mock("../../src/modules/threads/thread-service.js", () => ({
  buildDefaultThreadService: mocks.buildDefaultThreadService
}));

vi.mock("../../src/http/thread-websocket.js", () => ({
  attachThreadWebSocketGateway: mocks.attachGateway
}));

vi.mock("../../src/modules/runtime/session-control-plane.js", () => ({
  buildDefaultSessionControlPlane: mocks.buildDefaultSessionControlPlane
}));

vi.mock("../../src/modules/runtime/gateway.js", () => ({
  attachSessionAgentGateway: mocks.attachSessionAgentGateway
}));

vi.mock("../../src/bootstrap/startup-env.js", () => ({
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
      await import("../../src/bootstrap/index.js");

      expect(mocks.loadApiConfig).toHaveBeenCalledTimes(1);
      expect(mocks.requireDatabaseUrl).toHaveBeenCalledTimes(1);
      expect(mocks.verifyDatabaseReadiness).toHaveBeenCalledTimes(1);
      expect(mocks.buildDefaultAuthService).toHaveBeenCalledTimes(1);
      expect(mocks.buildDefaultThreadService).toHaveBeenCalledTimes(1);
      expect(mocks.buildDefaultSessionControlPlane).toHaveBeenCalledTimes(1);
      expect(mocks.buildApiApp).toHaveBeenCalledTimes(1);
      expect(mocks.createServer).toHaveBeenCalledTimes(1);
      expect(mocks.attachGateway).toHaveBeenCalledTimes(1);
      expect(mocks.attachSessionAgentGateway).toHaveBeenCalledTimes(1);
      expect(mocks.serverListen).toHaveBeenCalledWith(3101, "127.0.0.1", expect.any(Function));
      expect(signalHandlers.has("SIGINT")).toBe(true);
      expect(signalHandlers.has("SIGTERM")).toBe(true);
    } finally {
      onSpy.mockRestore();
    }
  });
});
