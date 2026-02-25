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
    path.join(repoDir, "apps/codex-app-server/.env.example"),
    "NODE_ENV=development\nCODEX_PORT=3010\nCODEX_HOST=0.0.0.0\n"
  );
  await writeFileWithParents(
    path.join(repoDir, "apps/worker/.env.example"),
    "WORKER_RUN_MODE=loop\n"
  );
  await writeFileWithParents(
    path.join(repoDir, "db/postgres/.env.example"),
    "COMPOSE_PROJECT_NAME=compass\nPOSTGRES_PORT=5432\nDATABASE_URL=postgres://compass:compass@localhost:5432/compass\n"
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

      expect(apiEnv.API_HOST).toBe("0.0.0.0");
      expect(Number(apiEnv.API_PORT)).toBeGreaterThanOrEqual(41_000);
      expect(webEnv.VITE_API_BASE_URL).toBe(`http://localhost:${apiEnv.API_PORT}`);
      expect(webEnv.WEB_PORT).toBeDefined();
      expect(dbEnv.COMPOSE_PROJECT_NAME).toMatch(/^compass-[a-f0-9]{8}$/u);
      expect(dbEnv.DATABASE_URL).toBe(
        `postgres://compass:compass@localhost:${dbEnv.POSTGRES_PORT}/compass`
      );

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
      const workerAfter = await readFile(path.join(repoDir, "apps/worker/.env"), "utf8");

      expect(apiEnv.API_PORT).toBe("49991");
      expect(apiEnvContents.match(/^API_PORT=/gmu)).toHaveLength(1);
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
});
