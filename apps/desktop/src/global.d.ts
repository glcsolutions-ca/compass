import type { CompassDesktopApi } from "./preload-api";

declare global {
  interface Window {
    compassDesktop: CompassDesktopApi;
  }
}

export {};
