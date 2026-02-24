import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { WebSocketHub } from "./ws-hub.js";

class FakeWebSocket extends EventEmitter {
  static readonly OPEN_STATE = 1;
  readonly OPEN = FakeWebSocket.OPEN_STATE;
  readyState = FakeWebSocket.OPEN_STATE;
  readonly sent: string[] = [];

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }
}

describe("WebSocketHub", () => {
  it("broadcasts thread-scoped events only to matching subscribers", () => {
    const hub = new WebSocketHub();

    const scopedA = new FakeWebSocket();
    const scopedB = new FakeWebSocket();
    const unscoped = new FakeWebSocket();

    hub.subscribe(scopedA as never, "thr_A");
    hub.subscribe(scopedB as never, "thr_B");
    hub.subscribe(unscoped as never, null);

    hub.broadcast("thr_A", {
      type: "turn.started",
      payload: {
        threadId: "thr_A"
      }
    });

    expect(scopedA.sent).toHaveLength(1);
    expect(scopedB.sent).toHaveLength(0);
    expect(unscoped.sent).toHaveLength(1);
  });

  it("does not deliver threadless events to scoped subscribers", () => {
    const hub = new WebSocketHub();
    const scoped = new FakeWebSocket();
    const unscoped = new FakeWebSocket();

    hub.subscribe(scoped as never, "thr_A");
    hub.subscribe(unscoped as never, null);

    hub.broadcast(null, {
      type: "error",
      payload: {
        code: "ERR"
      }
    });

    expect(scoped.sent).toHaveLength(0);
    expect(unscoped.sent).toHaveLength(1);
  });

  it("removes closed subscribers and closes all sockets", () => {
    const hub = new WebSocketHub();
    const socket = new FakeWebSocket();

    hub.subscribe(socket as never, "thr_A");
    socket.emit("close");

    hub.broadcast("thr_A", {
      type: "turn.completed",
      payload: {}
    });

    expect(socket.sent).toHaveLength(0);

    const socket2 = new FakeWebSocket();
    hub.subscribe(socket2 as never, null);
    hub.closeAll();

    expect(socket2.readyState).toBe(3);
  });
});
