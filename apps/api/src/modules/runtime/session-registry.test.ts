import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { SessionRegistry } from "./session-registry.js";

function createFakeSocket() {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  return {
    readyState: WebSocket.OPEN,
    sent: [] as string[],
    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
      return this;
    },
    send(payload: string) {
      this.sent.push(payload);
    },
    close() {
      const closeHandlers = handlers.get("close") ?? [];
      for (const handler of closeHandlers) {
        handler();
      }
    }
  };
}

describe("SessionRegistry", () => {
  it("resolves waiters and turn responses for a live connection", async () => {
    const registry = new SessionRegistry();
    const socket = createFakeSocket();
    const waitForConnection = registry.waitForConnection("thr-1", 1_000);

    registry.registerConnection({
      socket: socket as unknown as WebSocket,
      hello: {
        type: "session.hello",
        sessionIdentifier: "thr-1",
        bootId: "boot-1",
        runtimeKind: "echo",
        pid: 123,
        connectedAt: "2026-03-06T20:00:00.000Z"
      },
      now: new Date("2026-03-06T20:00:00.000Z")
    });

    await expect(waitForConnection).resolves.toMatchObject({
      sessionIdentifier: "thr-1",
      bootId: "boot-1"
    });

    const pending = registry.sendRun({
      sessionIdentifier: "thr-1",
      threadId: "thread-1",
      turnId: "turn-1",
      text: "hello",
      timeoutMs: 1_000
    });
    expect(socket.sent).toHaveLength(1);

    const outbound = JSON.parse(socket.sent[0] ?? "{}") as { requestId?: string };
    registry.resolveRun({
      type: "turn.result",
      requestId: String(outbound.requestId),
      turnId: "turn-1",
      outputText: "echo:hello",
      runtime: {
        sessionIdentifier: "thr-1",
        bootId: "boot-1",
        runtimeKind: "echo",
        pid: 123
      }
    });

    await expect(pending).resolves.toEqual({
      outputText: "echo:hello",
      bootId: "boot-1",
      runtimeKind: "echo",
      pid: 123
    });
  });

  it("rejects a pending run when the socket closes", async () => {
    const registry = new SessionRegistry();
    const socket = createFakeSocket();

    registry.registerConnection({
      socket: socket as unknown as WebSocket,
      hello: {
        type: "session.hello",
        sessionIdentifier: "thr-1",
        bootId: "boot-1",
        runtimeKind: "echo",
        pid: 123,
        connectedAt: "2026-03-06T20:00:00.000Z"
      },
      now: new Date("2026-03-06T20:00:00.000Z")
    });

    const pending = registry.sendRun({
      sessionIdentifier: "thr-1",
      threadId: "thread-1",
      turnId: "turn-1",
      text: "hello",
      timeoutMs: 1_000
    });

    socket.close();

    await expect(pending).rejects.toMatchObject({
      status: 502,
      code: "AGENT_SESSION_DISCONNECTED"
    });
  });
});
