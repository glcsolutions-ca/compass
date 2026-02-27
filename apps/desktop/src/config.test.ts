import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDesktopRuntimeConfig } from "./config";

const tempDirs: string[] = [];

async function createResourcesDir(payload?: unknown): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "compass-desktop-config-"));
  tempDirs.push(dir);

  if (payload) {
    await writeFile(
      path.join(dir, "desktop-runtime.json"),
      `${JSON.stringify(payload, null, 2)}\n`
    );
  }

  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    })
  );
});

describe("resolveDesktopRuntimeConfig", () => {
  it("uses localhost defaults in development", async () => {
    const resourcesPath = await createResourcesDir();

    const config = resolveDesktopRuntimeConfig({
      isPackaged: false,
      env: {},
      resourcesPath
    });

    expect(config.startUrl).toBe("http://localhost:3000");
    expect(config.allowedOrigins.has("http://localhost:3000")).toBe(true);
    expect(config.allowedOrigins.has("http://127.0.0.1:3000")).toBe(true);
    expect(config.authProviderOrigins.has("https://login.microsoftonline.com")).toBe(true);
    expect(config.authProviderOrigins.has("https://login.live.com")).toBe(true);
  });

  it("requires HTTPS packaged start URL", async () => {
    const resourcesPath = await createResourcesDir({
      startUrl: "http://example.com"
    });

    expect(() =>
      resolveDesktopRuntimeConfig({
        isPackaged: true,
        env: {},
        resourcesPath
      })
    ).toThrow("Packaged desktop start URL must be HTTPS");
  });

  it("loads packaged runtime config from resources", async () => {
    const resourcesPath = await createResourcesDir({
      startUrl: "https://app.example.com/dashboard"
    });

    const config = resolveDesktopRuntimeConfig({
      isPackaged: true,
      env: {},
      resourcesPath
    });

    expect(config.startUrl).toBe("https://app.example.com/dashboard");
    expect(config.allowedOrigins.has("https://app.example.com")).toBe(true);
  });

  it("parses allowlist origins from COMPASS_DESKTOP_ALLOWED_ORIGINS", async () => {
    const resourcesPath = await createResourcesDir({
      startUrl: "https://app.example.com"
    });

    const config = resolveDesktopRuntimeConfig({
      isPackaged: true,
      env: {
        COMPASS_DESKTOP_ALLOWED_ORIGINS:
          "https://app.example.com, https://docs.example.com/path, https://support.example.com"
      },
      resourcesPath
    });

    expect(config.allowedOrigins.has("https://app.example.com")).toBe(true);
    expect(config.allowedOrigins.has("https://docs.example.com")).toBe(true);
    expect(config.allowedOrigins.has("https://support.example.com")).toBe(true);
  });

  it("parses auth provider origins from COMPASS_DESKTOP_AUTH_PROVIDER_ORIGINS", async () => {
    const resourcesPath = await createResourcesDir({
      startUrl: "https://app.example.com"
    });

    const config = resolveDesktopRuntimeConfig({
      isPackaged: true,
      env: {
        COMPASS_DESKTOP_AUTH_PROVIDER_ORIGINS:
          "https://login.microsoftonline.us/tenant, https://id.example.com/login"
      },
      resourcesPath
    });

    expect(config.authProviderOrigins.has("https://login.microsoftonline.us")).toBe(true);
    expect(config.authProviderOrigins.has("https://id.example.com")).toBe(true);
  });
});
