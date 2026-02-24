import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import WebSocket from "ws";

async function appendGithubOutput(values: Record<string, string>) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  await writeFile(outputPath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "a" });
}

async function writeResult(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function requestJson(url: string, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      status: response.status,
      json,
      textSnippet: text.slice(0, 300)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function toWsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/v1/stream";
  url.search = "";
  url.searchParams.set("threadId", "codex_smoke_thread");
  return url.toString();
}

async function openWebSocket(url: string, timeoutMs = 3_000): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out opening websocket ${url}`));
    }, timeoutMs);

    socket.once("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function closeWebSocket(socket: WebSocket, timeoutMs = 2_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for websocket close"));
    }, timeoutMs);

    socket.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.close(1000, "codex-smoke");
  });
}

function isAuthErrorPayload(payload: unknown): payload is { code: string; message: string } {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return typeof record.code === "string" && typeof record.message === "string";
}

async function main() {
  const headSha = process.env.HEAD_SHA ?? "local";
  const testedSha = process.env.TESTED_SHA ?? headSha;
  const baseUrl = (
    process.env.CODEX_BASE_URL ??
    process.env.TARGET_CODEX_BASE_URL ??
    "http://127.0.0.1:3010"
  ).replace(/\/$/, "");

  const resultPath = path.join(".artifacts", "codex-smoke", testedSha, "result.json");
  const assertions: Array<{ id: string; pass: boolean; details: string }> = [];

  try {
    const health = await requestJson(`${baseUrl}/health`);
    assert.equal(health.status, 200, "codex health endpoint should return 200");
    assertions.push({ id: "health-200", pass: true, details: `status=${health.status}` });

    const models = await requestJson(`${baseUrl}/v1/models`);
    const modelsShapePass =
      (models.status === 200 && models.json !== null) ||
      (models.status === 401 && isAuthErrorPayload(models.json));
    assert.equal(
      modelsShapePass,
      true,
      "codex models endpoint should return 200 payload or 401 auth error payload"
    );
    assertions.push({
      id: "models-shape",
      pass: true,
      details: `status=${models.status} body=${models.textSnippet}`
    });

    const socket = await openWebSocket(toWsUrl(baseUrl));
    await closeWebSocket(socket);
    assertions.push({
      id: "ws-open-close",
      pass: true,
      details: "websocket open+close succeeded"
    });

    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      baseUrl,
      status: "pass",
      assertions
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ codex_smoke_path: resultPath });
    console.info(`codex smoke passed (${resultPath})`);
  } catch (error) {
    const payload = {
      schemaVersion: "1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      baseUrl,
      status: "fail",
      assertions,
      error: error instanceof Error ? error.message : String(error)
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ codex_smoke_path: resultPath });
    throw error;
  }
}

void main();
