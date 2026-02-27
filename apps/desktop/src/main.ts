import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from "electron";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDesktopRuntimeConfig, type DesktopRuntimeConfig } from "./config";
import {
  isInAppAuthBootstrapUrl,
  isInAppAuthCompletionUrl,
  isInAppAuthNavigationAllowed
} from "./in-app-auth-policy";
import {
  type AgentLocalLoginStartInput,
  type AgentLocalTurnInterruptInput,
  type AgentLocalTurnStartInput,
  IPC_CHANNELS
} from "./ipc";
import { LocalRuntimeManager, type LocalAuthState } from "./local-runtime-manager";
import { assertExternalOpenAllowed, isNavigationAllowed } from "./navigation-policy";

let mainWindow: BrowserWindow | null = null;
let authWindow: BrowserWindow | null = null;
let runtimeConfig: DesktopRuntimeConfig | null = null;

function openExternalSafely(rawUrl: string): void {
  try {
    const parsed = assertExternalOpenAllowed(rawUrl);
    void shell.openExternal(parsed.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Blocked external URL: ${rawUrl} (${message})`);
  }
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
}

function closeAuthWindow(): void {
  if (!authWindow || authWindow.isDestroyed()) {
    authWindow = null;
    return;
  }

  authWindow.close();
  authWindow = null;
}

async function completeInAppAuth(targetUrl: string): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    closeAuthWindow();
    return;
  }

  try {
    await mainWindow.loadURL(targetUrl);
    focusMainWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to navigate main window after in-app auth: ${message}`);
  } finally {
    closeAuthWindow();
  }
}

function openInAppAuthWindow(nextRuntimeConfig: DesktopRuntimeConfig, authStartUrl: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  let window = authWindow;
  if (!window || window.isDestroyed()) {
    let completionStarted = false;
    const maybeCompleteAuth = (url: string): void => {
      if (completionStarted) {
        return;
      }
      if (!isInAppAuthCompletionUrl({ rawUrl: url, startUrl: nextRuntimeConfig.startUrl })) {
        return;
      }

      completionStarted = true;
      void completeInAppAuth(url);
    };

    window = new BrowserWindow({
      width: 520,
      height: 760,
      minWidth: 420,
      minHeight: 620,
      autoHideMenuBar: true,
      title: "Compass Sign In",
      parent: mainWindow,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    });

    window.once("ready-to-show", () => {
      if (window && !window.isDestroyed()) {
        window.show();
        window.focus();
      }
    });

    window.on("closed", () => {
      if (authWindow === window) {
        authWindow = null;
      }
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
      openExternalSafely(url);
      return { action: "deny" };
    });

    window.webContents.on("will-navigate", (event, url) => {
      if (
        isInAppAuthNavigationAllowed({
          rawUrl: url,
          startUrl: nextRuntimeConfig.startUrl,
          authProviderOrigins: nextRuntimeConfig.authProviderOrigins
        })
      ) {
        return;
      }

      event.preventDefault();
      openExternalSafely(url);
    });

    window.webContents.on("will-redirect", (event, url) => {
      if (
        !isInAppAuthNavigationAllowed({
          rawUrl: url,
          startUrl: nextRuntimeConfig.startUrl,
          authProviderOrigins: nextRuntimeConfig.authProviderOrigins
        })
      ) {
        event.preventDefault();
        openExternalSafely(url);
        return;
      }

      if (isInAppAuthCompletionUrl({ rawUrl: url, startUrl: nextRuntimeConfig.startUrl })) {
        event.preventDefault();
        maybeCompleteAuth(url);
      }
    });

    window.webContents.on("did-navigate", (_event, url) => {
      maybeCompleteAuth(url);
    });

    authWindow = window;
  }

  void window.loadURL(authStartUrl);
}

function createMainWindow(nextRuntimeConfig: DesktopRuntimeConfig): BrowserWindow {
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
    if (isInAppAuthBootstrapUrl({ rawUrl: url, startUrl: nextRuntimeConfig.startUrl })) {
      openInAppAuthWindow(nextRuntimeConfig, url);
      return { action: "deny" };
    }

    openExternalSafely(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isInAppAuthBootstrapUrl({ rawUrl: url, startUrl: nextRuntimeConfig.startUrl })) {
      event.preventDefault();
      openInAppAuthWindow(nextRuntimeConfig, url);
      return;
    }

    if (isNavigationAllowed(url, nextRuntimeConfig.allowedOrigins)) {
      return;
    }

    event.preventDefault();
    openExternalSafely(url);
  });

  void window.loadURL(nextRuntimeConfig.startUrl);

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function emptyAuthState(): LocalAuthState {
  return {
    authenticated: false,
    mode: null,
    account: null,
    updatedAt: null
  };
}

function createEncryptedLocalAuthStore(baseDir: string): {
  read(): Promise<LocalAuthState>;
  write(state: LocalAuthState): Promise<void>;
  clear(): Promise<void>;
} {
  const storePath = path.join(baseDir, "agent-local-auth-state.bin");

  return {
    async read(): Promise<LocalAuthState> {
      try {
        const encrypted = await readFile(storePath);
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("OS secure storage is unavailable");
        }

        const json = safeStorage.decryptString(encrypted);
        const parsed = JSON.parse(json) as Partial<LocalAuthState>;

        return {
          authenticated: parsed.authenticated === true,
          mode: parsed.mode === "chatgpt" || parsed.mode === "apiKey" ? parsed.mode : null,
          account:
            parsed.account && typeof parsed.account.label === "string"
              ? { label: parsed.account.label }
              : null,
          updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null
        };
      } catch {
        return emptyAuthState();
      }
    },
    async write(state: LocalAuthState): Promise<void> {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("OS secure storage is unavailable");
      }

      await mkdir(baseDir, { recursive: true });
      const encrypted = safeStorage.encryptString(JSON.stringify(state));
      await writeFile(storePath, encrypted);
    },
    async clear(): Promise<void> {
      await rm(storePath, { force: true });
    }
  };
}

function registerIpcHandlers(): void {
  const runtimeManager = new LocalRuntimeManager({
    authStore: createEncryptedLocalAuthStore(app.getPath("userData"))
  });

  runtimeManager.subscribe((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.agentEvent, event);
      }
    }
  });

  ipcMain.on(IPC_CHANNELS.getAppVersion, (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, rawUrl: string) => {
    const parsed = assertExternalOpenAllowed(rawUrl);
    await shell.openExternal(parsed.toString());
  });

  ipcMain.handle(
    IPC_CHANNELS.agentLocalLoginStart,
    async (_event, payload: AgentLocalLoginStartInput) => {
      if (!payload || (payload.mode !== "chatgpt" && payload.mode !== "apiKey")) {
        throw new Error("Unsupported local login mode");
      }

      const state = await runtimeManager.loginStart(payload);
      if (payload.mode === "chatgpt" && state.authUrl) {
        openExternalSafely(state.authUrl);
      }

      return state;
    }
  );

  ipcMain.handle(IPC_CHANNELS.agentLocalLoginStatus, async () => {
    return runtimeManager.loginStatus();
  });

  ipcMain.handle(IPC_CHANNELS.agentLocalLogout, async () => {
    return runtimeManager.logout();
  });

  ipcMain.handle(
    IPC_CHANNELS.agentLocalTurnStart,
    async (_event, payload: AgentLocalTurnStartInput) => {
      if (!payload || typeof payload.threadId !== "string" || typeof payload.text !== "string") {
        throw new Error("Invalid local turn payload");
      }

      return runtimeManager.startTurn(payload);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.agentLocalTurnInterrupt,
    async (_event, payload: AgentLocalTurnInterruptInput) => {
      if (!payload || typeof payload.turnId !== "string") {
        throw new Error("Invalid interrupt payload");
      }

      return runtimeManager.interruptTurn(payload);
    }
  );
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusMainWindow();
  });

  void app
    .whenReady()
    .then(() => {
      registerIpcHandlers();

      runtimeConfig = resolveDesktopRuntimeConfig({
        isPackaged: app.isPackaged,
        env: process.env,
        resourcesPath: process.resourcesPath
      });
      mainWindow = createMainWindow(runtimeConfig);

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          if (!runtimeConfig) {
            runtimeConfig = resolveDesktopRuntimeConfig({
              isPackaged: app.isPackaged,
              env: process.env,
              resourcesPath: process.resourcesPath
            });
          }

          mainWindow = createMainWindow(runtimeConfig);
        }

        focusMainWindow();
      });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      dialog.showErrorBox("Desktop startup failed", message);
      app.exit(1);
    });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
