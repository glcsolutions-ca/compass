import { contextBridge, ipcRenderer } from "electron";
import { createCompassDesktopApi } from "./preload-api";

contextBridge.exposeInMainWorld("compassDesktop", createCompassDesktopApi(ipcRenderer));
