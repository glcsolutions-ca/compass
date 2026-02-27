import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { test } from "node:test";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fakeCodexAppServerPath = path.join(__dirname, "test-fixtures", "fake-codex-app-server.mjs");

async function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate test port"));
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 8000) {
  const startedAt = Date.now();
  // Poll readiness instead of sleeping to keep tests deterministic.
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Runtime did not become healthy within ${timeoutMs}ms`);
}

async function startRuntimeForTest(options = {}) {
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: __dirname,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      SESSION_RUNTIME_ENGINE: options.engine || "mock",
      ...options.env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  await waitForHealth(baseUrl);

  return {
    baseUrl,
    stop: async () => {
      if (child.exitCode !== null) {
        return;
      }

      child.kill("SIGTERM");
      await new Promise((resolve) => {
        child.once("exit", () => resolve());
      });

      if (stderr.trim()) {
        assert.equal(stderr.includes("Error"), false, `Runtime stderr: ${stderr}`);
      }
    }
  };
}

test("runtime health endpoint returns deterministic baseline payload", async () => {
  const runtime = await startRuntimeForTest();

  try {
    const response = await fetch(`${runtime.baseUrl}/health`);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.status, "ok");
    assert.equal(payload.engine, "mock");
    assert.equal(typeof payload.bootId, "string");
    assert.equal(typeof payload.requestCount, "number");
  } finally {
    await runtime.stop();
  }
});

test("session bootstrap and turn start return runtime metadata in mock mode", async () => {
  const runtime = await startRuntimeForTest();

  try {
    const bootstrapResponse = await fetch(
      `${runtime.baseUrl}/agent/session/bootstrap?identifier=thread-abc`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({})
      }
    );

    assert.equal(bootstrapResponse.status, 200);
    const bootstrap = await bootstrapResponse.json();
    assert.equal(bootstrap.ok, true);
    assert.equal(bootstrap.session.identifier, "thread-abc");

    const startResponse = await fetch(
      `${runtime.baseUrl}/agent/turns/start?identifier=thread-abc`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          threadId: "thread-abc",
          turnId: "turn-123",
          text: "hello"
        })
      }
    );

    assert.equal(startResponse.status, 200);
    const result = await startResponse.json();
    assert.equal(result.turnId, "turn-123");
    assert.equal(result.status, "completed");
    assert.equal(result.outputText, "Mock response: hello");
    assert.equal(result.runtimeMetadata.engine, "mock");
    assert.equal(result.runtimeMetadata.identifier, "thread-abc");
  } finally {
    await runtime.stop();
  }
});

test("codex engine bootstraps sticky thread mapping and returns streamed output", async () => {
  const runtime = await startRuntimeForTest({
    engine: "codex",
    env: {
      CODEX_APP_SERVER_COMMAND: process.execPath,
      CODEX_APP_SERVER_ARGS: fakeCodexAppServerPath,
      CODEX_RUNTIME_REQUEST_TIMEOUT_MS: "10000",
      CODEX_RUNTIME_TURN_TIMEOUT_MS: "20000"
    }
  });

  try {
    const firstBootstrap = await fetch(
      `${runtime.baseUrl}/agent/session/bootstrap?identifier=thread-a`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: "{}"
      }
    );
    assert.equal(firstBootstrap.status, 200);
    const first = await firstBootstrap.json();

    const secondBootstrap = await fetch(
      `${runtime.baseUrl}/agent/session/bootstrap?identifier=thread-a`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: "{}"
      }
    );
    assert.equal(secondBootstrap.status, 200);
    const second = await secondBootstrap.json();

    const thirdBootstrap = await fetch(
      `${runtime.baseUrl}/agent/session/bootstrap?identifier=thread-b`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: "{}"
      }
    );
    assert.equal(thirdBootstrap.status, 200);
    const third = await thirdBootstrap.json();

    assert.equal(first.session.codexThreadId, second.session.codexThreadId);
    assert.notEqual(first.session.codexThreadId, third.session.codexThreadId);

    const startResponse = await fetch(`${runtime.baseUrl}/agent/turns/start?identifier=thread-a`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text: "hello codex"
      })
    });

    assert.equal(startResponse.status, 200);
    const result = await startResponse.json();
    assert.equal(result.status, "completed");
    assert.equal(result.outputText, "Fake response: hello codex");
    assert.equal(result.runtimeMetadata.engine, "codex");
    assert.equal(result.runtimeMetadata.codexThreadId, first.session.codexThreadId);
  } finally {
    await runtime.stop();
  }
});

test("codex engine recovers from app-server crash and retries turn start", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "codex-runtime-test-"));
  const crashMarkerFile = path.join(tempDir, "crash-marker");

  const runtime = await startRuntimeForTest({
    engine: "codex",
    env: {
      CODEX_APP_SERVER_COMMAND: process.execPath,
      CODEX_APP_SERVER_ARGS: fakeCodexAppServerPath,
      CODEX_RUNTIME_REQUEST_TIMEOUT_MS: "10000",
      CODEX_RUNTIME_TURN_TIMEOUT_MS: "20000",
      CODEX_RUNTIME_MAX_RESTARTS: "3",
      FAKE_CODEX_CRASH_MARKER_FILE: crashMarkerFile
    }
  });

  try {
    const startResponse = await fetch(
      `${runtime.baseUrl}/agent/turns/start?identifier=thread-restart`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          text: "recover please"
        })
      }
    );

    assert.equal(startResponse.status, 200);
    const result = await startResponse.json();
    assert.equal(result.status, "completed");
    assert.equal(result.outputText, "Fake response: recover please");

    const healthResponse = await fetch(`${runtime.baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.engine, "codex");
    assert.ok(Number(health.codex.restartCount) >= 1);
  } finally {
    await runtime.stop();
    await rm(tempDir, { recursive: true, force: true });
  }
});
