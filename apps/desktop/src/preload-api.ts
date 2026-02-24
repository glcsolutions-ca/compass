import { IPC_CHANNELS } from "./ipc";
import { assertExternalOpenAllowed } from "./navigation-policy";

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  sendSync(channel: string, ...args: unknown[]): unknown;
}

export interface CompassDesktopApi {
  getAppVersion(): string;
  openExternal(url: string): Promise<void>;
  isDesktop(): true;
}

export function createCompassDesktopApi(ipcRenderer: IpcRendererLike): CompassDesktopApi {
  return {
    getAppVersion() {
      const version = ipcRenderer.sendSync(IPC_CHANNELS.getAppVersion);

      if (typeof version !== "string") {
        throw new Error("Desktop API returned an invalid app version.");
      }

      return version;
    },
    async openExternal(url: string): Promise<void> {
      const parsed = assertExternalOpenAllowed(url);
      await ipcRenderer.invoke(IPC_CHANNELS.openExternal, parsed.toString());
    },
    isDesktop() {
      return true;
    }
  };
}
