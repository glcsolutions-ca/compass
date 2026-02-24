import { EventEmitter } from "node:events";
import readline from "node:readline";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodexAppConfig } from "../config/index.js";
import { WebSocketHub } from "../realtime/ws-hub.js";
import { InMemoryRepository } from "../storage/repository.js";
import { CodexGateway, mapNotificationToStreamType } from "./gateway.js";

const TEST_CONFIG: CodexAppConfig = {
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

const TEST_LOGGER = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
};

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdio = [this.stdin, this.stdout, this.stderr];
  kill = vi.fn(() => true);
  pid = 1;
  spawnfile = "codex";
  spawnargs = ["codex", "app-server"];
  connected = true;
  exitCode = null;
  signalCode = null;
  killed = false;

  disconnect = vi.fn();
  send = vi.fn();
  unref = vi.fn();
  ref = vi.fn();
}

interface GatewayPrivateApi {
  handleServerRequest(id: string, method: string, params: unknown): Promise<void>;
}

describe("CodexGateway", () => {
  const gateways: CodexGateway[] = [];

  afterEach(async () => {
    for (const gateway of gateways) {
      await gateway.stop();
    }
    gateways.length = 0;
    vi.clearAllMocks();
  });

  it("enforces single-response semantics for approvals", async () => {
    const repository = new InMemoryRepository();
    const hub = new WebSocketHub();
    const child = new FakeChildProcess();
    wireInitializeResponder(child);

    const spawnFn = (_command: string, _args: readonly string[], _options: unknown) =>
      child as never;

    const gateway = new CodexGateway({
      config: TEST_CONFIG,
      repository,
      hub,
      logger: TEST_LOGGER,
      spawnFn
    });
    gateways.push(gateway);

    await gateway.start();
    await (gateway as unknown as GatewayPrivateApi).handleServerRequest(
      "approval_1",
      "item/commandExecution/requestApproval",
      {
        threadId: "thr_1",
        turnId: "turn_1",
        itemId: "item_1",
        reason: "Need approval"
      }
    );

    await expect(gateway.respondApproval("approval_1", "accept")).resolves.toBeUndefined();
    await expect(gateway.respondApproval("approval_1", "accept")).rejects.toThrow(
      "No pending approval"
    );
  });
});

describe("mapNotificationToStreamType", () => {
  it("maps supported notification methods", () => {
    expect(mapNotificationToStreamType("thread/started")).toBe("thread.started");
    expect(mapNotificationToStreamType("turn/started")).toBe("turn.started");
    expect(mapNotificationToStreamType("turn/completed")).toBe("turn.completed");
    expect(mapNotificationToStreamType("item/started")).toBe("item.started");
    expect(mapNotificationToStreamType("item/completed")).toBe("item.completed");
    expect(mapNotificationToStreamType("item/contentDelta")).toBe("item.delta");
    expect(mapNotificationToStreamType("error")).toBe("error");
    expect(mapNotificationToStreamType("unknown/method")).toBeNull();
  });
});

function wireInitializeResponder(child: FakeChildProcess): void {
  const reader = readline.createInterface({ input: child.stdin });
  reader.on("line", (line) => {
    const message = JSON.parse(line) as { id?: string | number; method?: string };
    if (message.method === "initialize" && message.id !== undefined) {
      child.stdout.write(
        `${JSON.stringify({
          id: message.id,
          result: {
            capabilities: {}
          }
        })}\n`
      );
    }
  });
}
