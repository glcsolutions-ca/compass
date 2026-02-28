import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock
}));

import { CodexJsonRpcClient } from "./index.js";

function createFakeChildProcess() {
  const child = new EventEmitter();
  child.killed = false;
  child.pid = 12345;
  child.stdin = {
    write: (_data, callback) => {
      if (typeof callback === "function") {
        callback();
      }
      return true;
    }
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {
    child.killed = true;
    setTimeout(() => {
      child.emit("exit", 0, null);
    }, 0);
    return true;
  };
  return child;
}

describe("CodexJsonRpcClient startup ordering", () => {
  afterEach(() => {
    spawnMock.mockReset();
  });

  it("marks initialized before auto-login auth bootstrap", async () => {
    spawnMock.mockImplementation(() => createFakeChildProcess());
    const client = new CodexJsonRpcClient({
      command: "codex",
      args: ["app-server"],
      autoLoginApiKey: "sk-test"
    });

    vi.spyOn(client, "requestRaw").mockResolvedValue({});
    vi.spyOn(client, "notify").mockResolvedValue(undefined);
    const ensureAccountAuthSpy = vi
      .spyOn(client, "ensureAccountAuth")
      .mockImplementation(async () => {
        expect(client.initialized).toBe(true);
      });

    await client.startInternal();

    expect(ensureAccountAuthSpy).toHaveBeenCalledTimes(1);
    expect(ensureAccountAuthSpy).toHaveBeenCalledWith("sk-test");
    expect(client.initialized).toBe(true);

    await client.stop();
  });
});
