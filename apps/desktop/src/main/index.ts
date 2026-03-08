import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEB_URL = "http://127.0.0.1:3000";
const DEFAULT_DESKTOP_AUTH_SCHEME = "ca.glsolutions.compass";
const DESKTOP_CALLBACK_HOSTNAME = "auth";
const DESKTOP_CALLBACK_PATHNAME = "/callback";

let mainWindow: BrowserWindow | null = null;
const pendingDeepLinks: string[] = [];

function resolveWebUrl() {
  return process.env.COMPASS_WEB_URL?.trim() || process.env.WEB_BASE_URL?.trim() || DEFAULT_WEB_URL;
}

function resolveDesktopAuthScheme() {
  return process.env.DESKTOP_AUTH_SCHEME?.trim() || DEFAULT_DESKTOP_AUTH_SCHEME;
}

function isAppOrigin(url: string) {
  try {
    return new URL(url).origin === new URL(resolveWebUrl()).origin;
  } catch {
    return false;
  }
}

function collectDeepLinks(argv: string[]) {
  const protocolPrefix = `${resolveDesktopAuthScheme()}:`;
  return argv.filter((value) => value.startsWith(protocolPrefix));
}

function registerDesktopProtocol() {
  const protocol = resolveDesktopAuthScheme();
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])]);
    return;
  }

  app.setAsDefaultProtocolClient(protocol);
}

function focusMainWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
}

function buildDesktopCompletionUrl(handoffToken: string) {
  const completionUrl = new URL("/v1/auth/desktop/complete", resolveWebUrl());
  completionUrl.searchParams.set("handoff", handoffToken);
  return completionUrl.toString();
}

async function handleDesktopDeepLink(rawUrl: string) {
  const window = mainWindow ?? createMainWindow();

  let deepLink: URL;
  try {
    deepLink = new URL(rawUrl);
  } catch {
    return;
  }

  if (deepLink.protocol !== `${resolveDesktopAuthScheme()}:`) {
    return;
  }

  if (
    deepLink.hostname !== DESKTOP_CALLBACK_HOSTNAME ||
    deepLink.pathname !== DESKTOP_CALLBACK_PATHNAME
  ) {
    await window.loadURL(resolveWebUrl());
    return;
  }

  const handoffToken = deepLink.searchParams.get("handoff")?.trim();
  if (!handoffToken) {
    await window.loadURL(
      new URL("/login?error=desktop_handoff_invalid", resolveWebUrl()).toString()
    );
    return;
  }

  await window.loadURL(buildDesktopCompletionUrl(handoffToken));
}

async function flushPendingDeepLinks() {
  while (pendingDeepLinks.length > 0) {
    const next = pendingDeepLinks.shift();
    if (!next) {
      continue;
    }

    await handleDesktopDeepLink(next);
  }
}

function maybeOpenExternal(event: Electron.Event, url: string) {
  if (isAppOrigin(url)) {
    return;
  }

  event.preventDefault();
  void shell.openExternal(url);
  if (mainWindow) {
    void mainWindow.loadURL(resolveWebUrl());
  }
}

function attachWindowHandlers(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppOrigin(url)) {
      return { action: "allow" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    maybeOpenExternal(event, url);
  });

  window.webContents.on("will-redirect", (event, url) => {
    maybeOpenExternal(event, url);
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

function createMainWindow() {
  if (mainWindow) {
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: "#f7f7f8",
    webPreferences: {
      preload: path.resolve(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      sandbox: false
    },
    title: "Compass"
  });

  attachWindowHandlers(window);
  mainWindow = window;
  void window.loadURL(resolveWebUrl());

  if (process.env.ELECTRON_OPEN_DEVTOOLS === "true") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  void flushPendingDeepLinks();
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    pendingDeepLinks.push(...collectDeepLinks(argv));
    focusMainWindow();
    void flushPendingDeepLinks();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    pendingDeepLinks.push(url);
    focusMainWindow();
    void flushPendingDeepLinks();
  });

  void app.whenReady().then(() => {
    registerDesktopProtocol();
    ipcMain.handle("compass:openExternal", async (_event, url: unknown) => {
      if (typeof url !== "string" || url.trim().length === 0) {
        return;
      }

      await shell.openExternal(url);
    });
    pendingDeepLinks.push(...collectDeepLinks(process.argv));
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      } else {
        focusMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
