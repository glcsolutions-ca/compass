import os from "node:os";
import path from "node:path";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ensureLocalEnv, resolveLocalEnvValues } from "./ensure-local-env.mjs";

async function withTempRepo(run) {
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "ensure-local-env-"));
  try {
    await seedExampleFiles(repoDir);
    return await run(repoDir);
  } finally {
    await rm(repoDir, { recursive: true, force: true });
  }
}

async function seedExampleFiles(repoDir) {
  await writeFileWithParents(
    path.join(repoDir, "apps/api/.env.example"),
    "API_HOST=0.0.0.0\nAPI_PORT=3001\nLOG_LEVEL=info\n"
  );
  await writeFileWithParents(
    path.join(repoDir, "apps/web/.env.example"),
    "WEB_PORT=3000\nVITE_API_BASE_URL=http://localhost:3001\n"
  );
  await writeFileWithParents(
    path.join(repoDir, "apps/worker/.env.example"),
    "WORKER_RUN_MODE=loop\n"
  );
  await writeFileWithParents(
    path.join(repoDir, "db/postgres/.env.example"),
    "COMPOSE_PROJECT_NAME=compass\nPOSTGRES_PORT=5432\nDATABASE_URL=postgres://compass:compass@localhost:5432/compass\n"
  );
  await writeFileWithParents(
    path.join(repoDir, "apps/codex-session-runtime/.env.example"),
    "HOST=127.0.0.1\nPORT=8080\nSESSION_RUNTIME_ENGINE=codex\nCODEX_APP_SERVER_COMMAND=codex\nCODEX_APP_SERVER_ARGS=app-server\n"
  );
}

async function writeFileWithParents(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function parseEnvFile(content) {
  const values = {};
  for (const line of content.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (match) {
      values[match[1]] = match[2];
    }
  }
  return values;
}

describe("ensure-local-env", () => {
  it("creates missing managed .env files from examples with required generated defaults", async () => {
    await withTempRepo(async (repoDir) => {
      await ensureLocalEnv({
        rootDir: repoDir,
        env: {},
        isPortAvailableFn: async () => true,
        logger: () => {}
      });

      const apiEnv = parseEnvFile(await readFile(path.join(repoDir, "apps/api/.env"), "utf8"));
      const webEnv = parseEnvFile(await readFile(path.join(repoDir, "apps/web/.env"), "utf8"));
      const dbEnv = parseEnvFile(await readFile(path.join(repoDir, "db/postgres/.env"), "utf8"));
      const runtimeEnv = parseEnvFile(
        await readFile(path.join(repoDir, "apps/codex-session-runtime/.env"), "utf8")
      );

      expect(apiEnv.API_HOST).toBe("0.0.0.0");
      expect(Number(apiEnv.API_PORT)).toBeGreaterThanOrEqual(41_000);
      expect(apiEnv.AUTH_MODE).toBe("mock");
      expect(apiEnv.AGENT_GATEWAY_ENABLED).toBe("true");
      expect(apiEnv.AGENT_RUNTIME_PROVIDER).toBe("local_process");
      expect(apiEnv.AGENT_RUNTIME_ENDPOINT).toBe(`http://127.0.0.1:${runtimeEnv.PORT}`);
      expect(webEnv.VITE_API_BASE_URL).toBe(`http://localhost:${apiEnv.API_PORT}`);
      expect(webEnv.WEB_PORT).toBeDefined();
      expect(dbEnv.COMPOSE_PROJECT_NAME).toMatch(/^compass-[a-f0-9]{8}$/u);
      expect(dbEnv.DATABASE_URL).toBe(
        `postgres://compass:compass@localhost:${dbEnv.POSTGRES_PORT}/compass`
      );
      expect(runtimeEnv.HOST).toBe("127.0.0.1");
      expect(Number(runtimeEnv.PORT)).toBeGreaterThanOrEqual(41_000);
      expect(runtimeEnv.SESSION_RUNTIME_ENGINE).toBe("codex");

      await expect(access(path.join(repoDir, "apps/worker/.env"))).rejects.toThrow();
    });
  });

  it("appends missing required keys but preserves existing values and leaves worker env untouched", async () => {
    await withTempRepo(async (repoDir) => {
      await writeFileWithParents(
        path.join(repoDir, "apps/api/.env"),
        "API_HOST=0.0.0.0\nAPI_PORT=49991\nLOG_LEVEL=debug\n"
      );
      await writeFileWithParents(
        path.join(repoDir, "apps/web/.env"),
        "VITE_API_BASE_URL=http://localhost:49991\n"
      );
      await writeFileWithParents(
        path.join(repoDir, "db/postgres/.env"),
        "POSTGRES_PORT=50003\nDATABASE_URL=postgres://custom:custom@localhost:50003/custom\n"
      );
      await writeFileWithParents(
        path.join(repoDir, "apps/worker/.env"),
        "WORKER_RUN_MODE=once\nWORKER_MAX_MESSAGES=2\n"
      );

      const workerBefore = await readFile(path.join(repoDir, "apps/worker/.env"), "utf8");

      await ensureLocalEnv({
        rootDir: repoDir,
        env: {},
        isPortAvailableFn: async () => true,
        logger: () => {}
      });

      const apiEnvContents = await readFile(path.join(repoDir, "apps/api/.env"), "utf8");
      const apiEnv = parseEnvFile(apiEnvContents);
      const webEnv = parseEnvFile(await readFile(path.join(repoDir, "apps/web/.env"), "utf8"));
      const dbEnv = parseEnvFile(await readFile(path.join(repoDir, "db/postgres/.env"), "utf8"));
      const runtimeEnv = parseEnvFile(
        await readFile(path.join(repoDir, "apps/codex-session-runtime/.env"), "utf8")
      );
      const workerAfter = await readFile(path.join(repoDir, "apps/worker/.env"), "utf8");

      expect(apiEnv.API_PORT).toBe("49991");
      expect(apiEnv.AUTH_MODE).toBe("mock");
      expect(apiEnv.AGENT_GATEWAY_ENABLED).toBe("true");
      expect(apiEnv.AGENT_RUNTIME_PROVIDER).toBe("local_process");
      expect(apiEnv.AGENT_RUNTIME_ENDPOINT).toBe(`http://127.0.0.1:${runtimeEnv.PORT}`);
      expect(apiEnvContents.match(/^API_PORT=/gmu)).toHaveLength(1);
      expect(apiEnvContents.match(/^AUTH_MODE=/gmu)).toHaveLength(1);
      expect(webEnv.VITE_API_BASE_URL).toBe("http://localhost:49991");
      expect(Number(webEnv.WEB_PORT)).toBeGreaterThanOrEqual(41_000);
      expect(dbEnv.DATABASE_URL).toBe("postgres://custom:custom@localhost:50003/custom");
      expect(dbEnv.COMPOSE_PROJECT_NAME).toMatch(/^compass-[a-f0-9]{8}$/u);
      expect(workerAfter).toBe(workerBefore);
    });
  });

  it("selects deterministic defaults for the same worktree path", async () => {
    const first = await resolveLocalEnvValues({
      rootDir: "/tmp/compass-worktree-stable",
      env: {},
      isPortAvailableFn: async () => true
    });
    const second = await resolveLocalEnvValues({
      rootDir: "/tmp/compass-worktree-stable",
      env: {},
      isPortAvailableFn: async () => true
    });

    expect(first.ports).toEqual(second.ports);
    expect(first.composeProjectName).toEqual(second.composeProjectName);
    expect(first.databaseUrl).toEqual(second.databaseUrl);
  });

  it("selects different generated ports for different worktree paths", async () => {
    const first = await resolveLocalEnvValues({
      rootDir: "/tmp/compass-worktree-alpha",
      env: {},
      isPortAvailableFn: async () => true
    });
    const second = await resolveLocalEnvValues({
      rootDir: "/tmp/compass-worktree-beta",
      env: {},
      isPortAvailableFn: async () => true
    });

    expect(first.ports).not.toEqual(second.ports);
  });

  it("derives POSTGRES_PORT from explicit DATABASE_URL when POSTGRES_PORT is unset", async () => {
    await withTempRepo(async (repoDir) => {
      await ensureLocalEnv({
        rootDir: repoDir,
        env: {
          DATABASE_URL: "postgres://compass:compass@localhost:5432/compass"
        },
        isPortAvailableFn: async () => true,
        logger: () => {}
      });

      const dbEnv = parseEnvFile(await readFile(path.join(repoDir, "db/postgres/.env"), "utf8"));
      expect(dbEnv.POSTGRES_PORT).toBe("5432");
      expect(dbEnv.DATABASE_URL).toBe("postgres://compass:compass@localhost:5432/compass");
    });
  });

  it("derives POSTGRES_PORT from existing DATABASE_URL when POSTGRES_PORT is missing", async () => {
    await withTempRepo(async (repoDir) => {
      await writeFileWithParents(
        path.join(repoDir, "db/postgres/.env"),
        "DATABASE_URL=postgres://compass:compass@localhost:55001/compass\n"
      );

      await ensureLocalEnv({
        rootDir: repoDir,
        env: {},
        isPortAvailableFn: async () => true,
        logger: () => {}
      });

      const dbEnv = parseEnvFile(await readFile(path.join(repoDir, "db/postgres/.env"), "utf8"));
      expect(dbEnv.POSTGRES_PORT).toBe("55001");
      expect(dbEnv.DATABASE_URL).toBe("postgres://compass:compass@localhost:55001/compass");
    });
  });

  it("reassigns runtime port when persisted runtime and postgres ports collide", async () => {
    await withTempRepo(async (repoDir) => {
      await writeFileWithParents(
        path.join(repoDir, "db/postgres/.env"),
        "POSTGRES_PORT=55432\nDATABASE_URL=postgres://compass:compass@localhost:55432/compass\n"
      );
      await writeFileWithParents(
        path.join(repoDir, "apps/codex-session-runtime/.env"),
        "HOST=127.0.0.1\nPORT=55432\nSESSION_RUNTIME_ENGINE=codex\nCODEX_APP_SERVER_COMMAND=codex\nCODEX_APP_SERVER_ARGS=app-server\n"
      );

      await ensureLocalEnv({
        rootDir: repoDir,
        env: {},
        isPortAvailableFn: async () => true,
        logger: () => {}
      });

      const dbEnv = parseEnvFile(await readFile(path.join(repoDir, "db/postgres/.env"), "utf8"));
      const runtimeEnv = parseEnvFile(
        await readFile(path.join(repoDir, "apps/codex-session-runtime/.env"), "utf8")
      );
      const apiEnv = parseEnvFile(await readFile(path.join(repoDir, "apps/api/.env"), "utf8"));

      expect(dbEnv.POSTGRES_PORT).toBe("55432");
      expect(runtimeEnv.PORT).not.toBe("55432");
      expect(apiEnv.AGENT_RUNTIME_ENDPOINT).toBe(`http://127.0.0.1:${runtimeEnv.PORT}`);
    });
  });
});
