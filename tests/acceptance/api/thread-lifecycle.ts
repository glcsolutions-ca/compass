import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

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

function withJsonHeaders(baseUrl: string, headers: Record<string, string> = {}) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    origin: baseUrl,
    ...headers
  };
}

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    redirect: "manual",
    ...init
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
    headers: response.headers,
    json,
    textSnippet: text.slice(0, 300)
  };
}

function extractCookie(header: string | null): string {
  if (!header) {
    throw new Error("Authentication response did not include a session cookie.");
  }

  const sessionCookie = header
    .split(/,(?=\s*__Host-compass_session=)/u)
    .flatMap((entry) => entry.split(";"))
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("__Host-compass_session="));

  if (!sessionCookie) {
    throw new Error(`Unable to extract __Host-compass_session from cookie header: ${header}`);
  }

  return sessionCookie;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function main() {
  const headSha = process.env.HEAD_SHA ?? "local";
  const testedSha = process.env.TESTED_SHA ?? headSha;
  const baseUrl = (
    process.env.BASE_URL ??
    process.env.TARGET_API_BASE_URL ??
    "http://127.0.0.1:3001"
  ).replace(/\/$/, "");

  const resultPath = path.join(".artifacts", "api-acceptance", testedSha, "result.json");
  const assertions: Array<{ id: string; pass: boolean; details: string }> = [];

  try {
    const authStart = await requestJson(`${baseUrl}/v1/auth/entra/start?returnTo=%2Fchat`);
    assert.equal(authStart.status, 302, "mock auth start should redirect");
    const cookie = extractCookie(authStart.headers.get("set-cookie"));
    const redirectLocation = authStart.headers.get("location") ?? "";
    assert.notEqual(redirectLocation.length, 0, "auth start should set a redirect target");
    assertions.push({
      id: "mock-auth-start",
      pass: true,
      details: `status=${authStart.status}, location=${redirectLocation}`
    });

    const me = await requestJson(`${baseUrl}/v1/auth/me`, {
      headers: {
        cookie
      }
    });
    assert.equal(me.status, 200, "/v1/auth/me should return 200 after login");
    assert.equal((me.json as { authenticated?: boolean } | null)?.authenticated, true);
    const activeWorkspaceSlug =
      readString((me.json as { personalWorkspaceSlug?: unknown } | null)?.personalWorkspaceSlug) ||
      readString((me.json as { activeWorkspaceSlug?: unknown } | null)?.activeWorkspaceSlug) ||
      readString(
        (me.json as { workspaces?: Array<{ slug?: unknown }> } | null)?.workspaces?.[0]?.slug
      );
    assert.notEqual(activeWorkspaceSlug.length, 0, "auth me should expose an active workspace");
    assertions.push({
      id: "auth-me",
      pass: true,
      details: `workspace=${activeWorkspaceSlug}`
    });

    const createThread = await requestJson(`${baseUrl}/v1/threads`, {
      method: "POST",
      headers: withJsonHeaders(baseUrl, { cookie }),
      body: JSON.stringify({
        workspaceSlug: activeWorkspaceSlug,
        executionMode: "cloud",
        title: "Acceptance Thread"
      })
    });
    assert.equal(createThread.status, 201, "thread creation should return 201");
    const threadId = readString(
      (createThread.json as { thread?: { threadId?: unknown } } | null)?.thread?.threadId
    );
    assert.notEqual(threadId.length, 0, "thread creation should return a thread id");
    assertions.push({
      id: "thread-created",
      pass: true,
      details: `threadId=${threadId}`
    });

    const listThreads = await requestJson(
      `${baseUrl}/v1/threads?workspaceSlug=${encodeURIComponent(activeWorkspaceSlug)}`,
      {
        headers: {
          cookie
        }
      }
    );
    assert.equal(listThreads.status, 200, "thread list should return 200");
    const threads = Array.isArray((listThreads.json as { threads?: unknown[] } | null)?.threads)
      ? ((listThreads.json as { threads?: Array<{ threadId?: unknown }> }).threads ?? [])
      : [];
    assert.equal(
      threads.some((thread) => readString(thread.threadId) === threadId),
      true,
      "created thread should appear in the thread list"
    );
    assertions.push({
      id: "thread-listed",
      pass: true,
      details: `count=${threads.length.toString()}`
    });

    const startTurn = await requestJson(`${baseUrl}/v1/threads/${encodeURIComponent(threadId)}/turns`, {
      method: "POST",
      headers: withJsonHeaders(baseUrl, { cookie }),
      body: JSON.stringify({
        text: "Acceptance test prompt",
        clientRequestId: `acceptance-${randomUUID()}`
      })
    });
    assert.equal(startTurn.status, 200, "turn start should return 200");
    const turnStatus = readString(
      (startTurn.json as { turn?: { status?: unknown } } | null)?.turn?.status
    );
    const outputText = readString(
      (startTurn.json as { outputText?: unknown } | null)?.outputText
    );
    assert.equal(turnStatus, "completed", "turn should complete through the public API");
    assert.notEqual(outputText.length, 0, "turn should yield output text");
    assertions.push({
      id: "turn-completed",
      pass: true,
      details: `status=${turnStatus}, outputLength=${outputText.length.toString()}`
    });

    const events = await requestJson(
      `${baseUrl}/v1/threads/${encodeURIComponent(threadId)}/events?limit=200`,
      {
        headers: {
          cookie
        }
      }
    );
    assert.equal(events.status, 200, "event list should return 200");
    const eventMethods = Array.isArray((events.json as { events?: unknown[] } | null)?.events)
      ? ((events.json as { events?: Array<{ method?: unknown }> }).events ?? []).map((event) =>
          readString(event.method)
        )
      : [];
    assert.equal(
      eventMethods.includes("thread.started"),
      true,
      "thread events should include thread.started"
    );
    assert.equal(
      eventMethods.includes("turn.started"),
      true,
      "thread events should include turn.started"
    );
    assert.equal(
      eventMethods.some((method) => method.startsWith("runtime.") || method === "item.delta"),
      true,
      "thread events should include runtime or item output activity"
    );
    assertions.push({
      id: "thread-events",
      pass: true,
      details: eventMethods.join(", ")
    });

    const payload = {
      schemaVersion: "api-acceptance.v1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      baseUrl,
      status: "pass",
      assertions
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ api_acceptance_path: resultPath });
    console.info(`API acceptance passed (${resultPath})`);
  } catch (error) {
    const payload = {
      schemaVersion: "api-acceptance.v1",
      generatedAt: new Date().toISOString(),
      headSha,
      testedSha,
      baseUrl,
      status: "fail",
      assertions,
      error: error instanceof Error ? error.message : String(error)
    };

    await writeResult(resultPath, payload);
    await appendGithubOutput({ api_acceptance_path: resultPath });
    throw error;
  }
}

void main();
