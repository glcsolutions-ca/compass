import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "node:path";
import { resolveDesktopRuntimeConfig } from "./config";
import { IPC_CHANNELS } from "./ipc";
import { assertExternalOpenAllowed, isNavigationAllowed } from "./navigation-policy";

function openExternalSafely(rawUrl: string): void {
  try {
    const parsed = assertExternalOpenAllowed(rawUrl);
    void shell.openExternal(parsed.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Blocked external URL: ${rawUrl} (${message})`);
  }
}

function createMainWindow(): BrowserWindow {
  const runtimeConfig = resolveDesktopRuntimeConfig({
    isPackaged: app.isPackaged,
    env: process.env,
    resourcesPath: process.resourcesPath
  });

  const window = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isNavigationAllowed(url, runtimeConfig.allowedOrigins)) {
      return;
    }

    event.preventDefault();
    openExternalSafely(url);
  });

  void window.loadURL(runtimeConfig.startUrl);

  window.on("closed", () => {
    // no-op; BrowserWindow lifecycle is tracked by Electron internals
  });

  return window;
}

function registerIpcHandlers(): void {
  ipcMain.on(IPC_CHANNELS.getAppVersion, (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, rawUrl: string) => {
    const parsed = assertExternalOpenAllowed(rawUrl);
    await shell.openExternal(parsed.toString());
  });
}

void app
  .whenReady()
  .then(() => {
    registerIpcHandlers();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Desktop startup failed", message);
    app.exit(1);
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
