import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalDevEnv } from "./local-env.mjs";

const cleanupDirs = [];

async function createTempRepo() {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "local-env-"));
  cleanupDirs.push(repoDir);
  return repoDir;
}

async function writeEnvFile(repoDir, relativePath, content) {
  const absolutePath = path.join(repoDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

async function writeDefaultEnvFiles(repoDir) {
  await writeEnvFile(
    repoDir,
    "apps/api/.env",
    [
      "API_PORT=3001",
      "AUTH_MODE=mock",
      "WEB_BASE_URL=http://localhost:3000",
      "ENTRA_REDIRECT_URI=http://localhost:3000/v1/auth/entra/callback",
      "AGENT_RUNTIME_ENDPOINT=http://127.0.0.1:8080"
    ].join("\n") + "\n"
  );
  await writeEnvFile(
    repoDir,
    "apps/web/.env",
    "WEB_PORT=3000\nVITE_API_BASE_URL=http://localhost:3001\n"
  );
  await writeEnvFile(repoDir, "apps/codex-session-runtime/.env", "HOST=127.0.0.1\nPORT=8080\n");
  await writeEnvFile(
    repoDir,
    "db/postgres/.env",
    "COMPOSE_PROJECT_NAME=compass\nPOSTGRES_PORT=5432\n"
  );
}

afterEach(async () => {
  while (cleanupDirs.length > 0) {
    const repoDir = cleanupDirs.pop();
    if (repoDir) {
      await rm(repoDir, { recursive: true, force: true });
    }
  }
});

describe("resolveLocalDevEnv", () => {
  it("uses precedence process.env > .env.local > .env", async () => {
    const repoDir = await createTempRepo();
    await writeDefaultEnvFiles(repoDir);
    await writeEnvFile(repoDir, "apps/web/.env.local", "WEB_PORT=3200\n");

    const resolved = await resolveLocalDevEnv({
      rootDir: repoDir,
      env: { WEB_PORT: "3300" },
      isPortAvailableFn: async () => true
    });

    expect(resolved.ports.WEB_PORT).toBe(3300);
    expect(resolved.env.WEB_PORT).toBe("3300");
  });

  it("applies .env.local overrides when process env is absent", async () => {
    const repoDir = await createTempRepo();
    await writeDefaultEnvFiles(repoDir);
    await writeEnvFile(repoDir, "apps/api/.env.local", "API_PORT=4101\n");
    await writeEnvFile(repoDir, "db/postgres/.env.local", "POSTGRES_PORT=5544\n");

    const resolved = await resolveLocalDevEnv({
      rootDir: repoDir,
      env: {},
      isPortAvailableFn: async () => true
    });

    expect(resolved.ports.API_PORT).toBe(4101);
    expect(resolved.ports.POSTGRES_PORT).toBe(5544);
    expect(resolved.env.API_PORT).toBe("4101");
    expect(resolved.env.POSTGRES_PORT).toBe("5544");
  });

  it("uses +10 tuple fallback when default ports are occupied", async () => {
    const repoDir = await createTempRepo();
    await writeDefaultEnvFiles(repoDir);

    const occupied = new Set([3000, 3001, 5432, 8080]);
    const resolved = await resolveLocalDevEnv({
      rootDir: repoDir,
      env: {},
      isPortAvailableFn: async (port) => !occupied.has(port)
    });

    expect(resolved.ports).toEqual({
      WEB_PORT: 3010,
      API_PORT: 3011,
      POSTGRES_PORT: 5442,
      SESSION_RUNTIME_PORT: 8090
    });
  });

  it("fails fast when pinned ports are unavailable", async () => {
    const repoDir = await createTempRepo();
    await writeDefaultEnvFiles(repoDir);

    await expect(
      resolveLocalDevEnv({
        rootDir: repoDir,
        env: { WEB_PORT: "39000" },
        isPortAvailableFn: async (port) => port !== 39000
      })
    ).rejects.toThrow("WEB_PORT is pinned to 39000");
  });

  it("derives coherent auth/runtime/database URLs", async () => {
    const repoDir = await createTempRepo();
    await writeDefaultEnvFiles(repoDir);

    const resolved = await resolveLocalDevEnv({
      rootDir: repoDir,
      env: { WEB_BASE_URL: "http://127.0.0.1:39000" },
      isPortAvailableFn: async () => true
    });

    expect(resolved.env.WEB_BASE_URL).toBe("http://127.0.0.1:39000");
    expect(resolved.env.ENTRA_REDIRECT_URI).toBe("http://127.0.0.1:39000/v1/auth/entra/callback");
    expect(resolved.env.AGENT_RUNTIME_ENDPOINT).toBe("http://127.0.0.1:8080");
    expect(resolved.env.DATABASE_URL).toBe("postgres://compass:compass@localhost:5432/compass");
  });

  it("prefers explicit DATABASE_URL from process env", async () => {
    const repoDir = await createTempRepo();
    await writeDefaultEnvFiles(repoDir);

    const resolvedProcess = await resolveLocalDevEnv({
      rootDir: repoDir,
      env: { DATABASE_URL: "postgres://env:env@localhost:7001/env" },
      isPortAvailableFn: async () => true
    });
    expect(resolvedProcess.env.DATABASE_URL).toBe("postgres://env:env@localhost:7001/env");
  });

  it("keeps DATABASE_URL aligned to fallback POSTGRES_PORT when defaults are occupied", async () => {
    const repoDir = await createTempRepo();
    await writeDefaultEnvFiles(repoDir);
    await writeEnvFile(
      repoDir,
      "db/postgres/.env",
      [
        "COMPOSE_PROJECT_NAME=compass",
        "POSTGRES_PORT=5432",
        "DATABASE_URL=postgres://compass:compass@localhost:5432/compass"
      ].join("\n") + "\n"
    );

    const occupied = new Set([3000, 3001, 5432, 8080]);
    const resolved = await resolveLocalDevEnv({
      rootDir: repoDir,
      env: {},
      isPortAvailableFn: async (port) => !occupied.has(port)
    });

    expect(resolved.ports.POSTGRES_PORT).toBe(5442);
    expect(resolved.env.DATABASE_URL).toBe("postgres://compass:compass@localhost:5442/compass");
  });

  it("returns only the required overlay keys", async () => {
    const repoDir = await createTempRepo();
    await writeDefaultEnvFiles(repoDir);

    const resolved = await resolveLocalDevEnv({
      rootDir: repoDir,
      env: {},
      isPortAvailableFn: async () => true
    });

    expect(Object.keys(resolved.env).sort()).toEqual(
      [
        "AGENT_RUNTIME_ENDPOINT",
        "API_PORT",
        "AUTH_MODE",
        "COMPOSE_PROJECT_NAME",
        "DATABASE_URL",
        "ENTRA_REDIRECT_URI",
        "HOST",
        "PORT",
        "POSTGRES_PORT",
        "SESSION_RUNTIME_PORT",
        "VITE_API_BASE_URL",
        "WEB_BASE_URL",
        "WEB_PORT"
      ].sort()
    );
  });
});
