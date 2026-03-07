import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  readSessionAgentConfig,
  readTextPayload,
  runSessionAgent,
  SESSION_AGENT_HEARTBEAT_MS
} from "./agent.js";

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;

  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    queueMicrotask(() => {
      this.emit("open");
    });
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.emit("close");
  }
}

describe("session-agent", () => {
  it("reads config from environment", () => {
    const config = readSessionAgentConfig({
      COMPASS_CONTROL_PLANE_URL: "ws://127.0.0.1:3001/internal/runtime-agent/connect",
      COMPASS_CONNECT_TOKEN: "token-1",
      COMPASS_SESSION_IDENTIFIER: "thr-thread-1",
      COMPASS_BOOT_ID: "boot-1"
    });

    expect(config.sessionIdentifier).toBe("thr-thread-1");
    expect(config.heartbeatMs).toBe(SESSION_AGENT_HEARTBEAT_MS);
  });

  it("normalizes websocket payload text", () => {
    expect(readTextPayload(Buffer.from("hello"))).toBe("hello");
  });

  it("sends hello and turn results", async () => {
    const exitProcess = vi.fn();
    const websocketRef = { current: null };

    const runPromise = runSessionAgent({
      config: {
        controlPlaneUrl: "ws://127.0.0.1:3001/internal/runtime-agent/connect",
        connectToken: "token-1",
        sessionIdentifier: "thr-thread-1",
        bootId: "boot-1",
        runtimeKind: "echo",
        heartbeatMs: 60_000
      },
      WebSocketCtor: class extends FakeWebSocket {
        constructor(...args) {
          super(...args);
          websocketRef.current = this;
        }
      },
      runtimeHandler: async (input) => ({
        outputText: `echo:${input.text}`,
        runtime: {
          sessionIdentifier: input.sessionIdentifier,
          bootId: input.bootId,
          runtimeKind: input.runtimeKind,
          pid: input.pid
        }
      }),
      exitProcess
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    websocketRef.current.emit(
      "message",
      JSON.stringify({
        type: "turn.run",
        requestId: "request-1",
        threadId: "thread-1",
        turnId: "turn-1",
        text: "hello"
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    websocketRef.current.close();
    await runPromise;

    expect(websocketRef.current.sent[0]).toMatchObject({
      type: "session.hello",
      sessionIdentifier: "thr-thread-1",
      bootId: "boot-1"
    });
    expect(websocketRef.current.sent[1]).toMatchObject({
      type: "turn.result",
      requestId: "request-1",
      turnId: "turn-1",
      outputText: "echo:hello"
    });
  });
});
