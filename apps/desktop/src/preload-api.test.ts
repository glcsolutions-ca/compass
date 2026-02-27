import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "./ipc";
import { createCompassDesktopApi } from "./preload-api";

function createIpcDouble() {
  return {
    sendSync: vi.fn().mockReturnValue("0.1.0"),
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    removeListener: vi.fn()
  };
}

describe("createCompassDesktopApi", () => {
  it("returns synchronous app version", () => {
    const ipc = createIpcDouble();
    const api = createCompassDesktopApi(ipc);

    expect(api.getAppVersion()).toBe("0.1.0");
    expect(ipc.sendSync).toHaveBeenCalledWith(IPC_CHANNELS.getAppVersion);
  });

  it("opens allowed external URLs via IPC", async () => {
    const ipc = createIpcDouble();
    const api = createCompassDesktopApi(ipc);

    await api.openExternal("https://example.com");

    expect(ipc.invoke).toHaveBeenCalledWith(IPC_CHANNELS.openExternal, "https://example.com/");
  });

  it("blocks unsupported protocols before invoking IPC", async () => {
    const ipc = createIpcDouble();
    const api = createCompassDesktopApi(ipc);

    await expect(api.openExternal("http://example.com")).rejects.toThrow(
      "Unsupported external URL protocol"
    );
    expect(ipc.invoke).not.toHaveBeenCalled();
  });

  it("marks environment as desktop", () => {
    const api = createCompassDesktopApi(createIpcDouble());

    expect(api.isDesktop()).toBe(true);
  });

  it("wires local runtime auth and turn commands through invoke", async () => {
    const ipc = createIpcDouble();
    ipc.invoke
      .mockResolvedValueOnce({
        authenticated: true,
        mode: "chatgpt",
        account: { label: "ChatGPT account" },
        updatedAt: "2026-02-27T00:00:00.000Z"
      })
      .mockResolvedValueOnce({
        turnId: "turn-1",
        status: "completed",
        outputText: "ok",
        sessionId: "sess-1",
        executionMode: "local",
        executionHost: "desktop_local"
      })
      .mockResolvedValueOnce({ turnId: "turn-1", status: "interrupted" });

    const api = createCompassDesktopApi(ipc);
    await api.localAuthStart({ mode: "chatgpt" });
    await api.localTurnStart({ threadId: "thread-1", text: "hello" });
    await api.localTurnInterrupt({ turnId: "turn-1" });

    expect(ipc.invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.agentLocalLoginStart, {
      mode: "chatgpt"
    });
    expect(ipc.invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.agentLocalTurnStart, {
      threadId: "thread-1",
      text: "hello"
    });
    expect(ipc.invoke).toHaveBeenNthCalledWith(3, IPC_CHANNELS.agentLocalTurnInterrupt, {
      turnId: "turn-1"
    });
  });

  it("registers and unregisters agent event listeners", () => {
    const ipc = createIpcDouble();
    const api = createCompassDesktopApi(ipc);
    const listener = vi.fn();

    const unsubscribe = api.onAgentEvent(listener);

    expect(ipc.on).toHaveBeenCalledTimes(1);
    expect(ipc.on).toHaveBeenCalledWith(IPC_CHANNELS.agentEvent, expect.any(Function));

    const handler = ipc.on.mock.calls[0]?.[1] as
      | ((event: unknown, payload: unknown) => void)
      | undefined;
    handler?.({}, { type: "turn.started", cursor: 1 });
    expect(listener).toHaveBeenCalledWith({ type: "turn.started", cursor: 1 });

    unsubscribe();
    expect(ipc.removeListener).toHaveBeenCalledWith(IPC_CHANNELS.agentEvent, handler);
  });
});
