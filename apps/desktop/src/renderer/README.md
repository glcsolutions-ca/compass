# Desktop Renderer

The desktop app is intentionally a thin Electron host. It loads the shared web shell and keeps platform-specific code in `main/` and `preload/`.
