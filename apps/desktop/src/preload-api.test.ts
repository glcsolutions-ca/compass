import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "./ipc";
import { createCompassDesktopApi } from "./preload-api";

describe("createCompassDesktopApi", () => {
  it("returns synchronous app version", () => {
    const sendSync = vi.fn().mockReturnValue("0.1.0");
    const invoke = vi.fn();
    const api = createCompassDesktopApi({ sendSync, invoke });

    expect(api.getAppVersion()).toBe("0.1.0");
    expect(sendSync).toHaveBeenCalledWith(IPC_CHANNELS.getAppVersion);
  });

  it("opens allowed external URLs via IPC", async () => {
    const sendSync = vi.fn().mockReturnValue("0.1.0");
    const invoke = vi.fn().mockResolvedValue(undefined);
    const api = createCompassDesktopApi({ sendSync, invoke });

    await api.openExternal("https://example.com");

    expect(invoke).toHaveBeenCalledWith(IPC_CHANNELS.openExternal, "https://example.com/");
  });

  it("blocks unsupported protocols before invoking IPC", async () => {
    const sendSync = vi.fn().mockReturnValue("0.1.0");
    const invoke = vi.fn().mockResolvedValue(undefined);
    const api = createCompassDesktopApi({ sendSync, invoke });

    await expect(api.openExternal("http://example.com")).rejects.toThrow(
      "Unsupported external URL protocol"
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("marks environment as desktop", () => {
    const api = createCompassDesktopApi({
      sendSync: vi.fn().mockReturnValue("0.1.0"),
      invoke: vi.fn().mockResolvedValue(undefined)
    });

    expect(api.isDesktop()).toBe(true);
  });
});
