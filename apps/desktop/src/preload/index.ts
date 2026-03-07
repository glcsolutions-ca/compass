import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("compassDesktop", {
  isDesktop() {
    return true;
  }
});
