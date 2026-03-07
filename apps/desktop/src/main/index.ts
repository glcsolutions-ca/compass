import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveWebUrl() {
  return process.env.COMPASS_WEB_URL?.trim() || "http://127.0.0.1:3000";
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.resolve(__dirname, "../preload/index.js")
    },
    title: "Compass"
  });

  const webUrl = resolveWebUrl();
  void window.loadURL(webUrl);

  if (process.env.ELECTRON_OPEN_DEVTOOLS === "true") {
    window.webContents.openDevTools({ mode: "detach" });
  }
}

void app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
