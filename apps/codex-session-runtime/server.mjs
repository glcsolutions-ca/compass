import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { EventEmitter } from "node:events";
import os from "node:os";
import { CodexJsonRpcClient } from "@compass/codex-runtime-core";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "8080", 10);
const engine = String(process.env.SESSION_RUNTIME_ENGINE || "codex")
  .trim()
  .toLowerCase();
const maxBodyBytes = Number.parseInt(process.env.MAX_BODY_BYTES || "1048576", 10);
const maxSleepMs = Number.parseInt(process.env.MOCK_ENGINE_MAX_SLEEP_MS || "5000", 10);
const codexRequestTimeoutMs = Number.parseInt(
  process.env.CODEX_RUNTIME_REQUEST_TIMEOUT_MS || "30000",
  10
);
const codexTurnTimeoutMs = Number.parseInt(
  process.env.CODEX_RUNTIME_TURN_TIMEOUT_MS || "120000",
  10
);
const codexInitTimeoutMs = Number.parseInt(
  process.env.CODEX_RUNTIME_INIT_TIMEOUT_MS || "30000",
  10
);
const codexMaxRestarts = Number.parseInt(process.env.CODEX_RUNTIME_MAX_RESTARTS || "2", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}

if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) {
  throw new Error("MAX_BODY_BYTES must be a positive integer");
}

if (!Number.isInteger(maxSleepMs) || maxSleepMs < 0) {
  throw new Error("MOCK_ENGINE_MAX_SLEEP_MS must be a non-negative integer");
}

if (!Number.isInteger(codexRequestTimeoutMs) || codexRequestTimeoutMs < 1000) {
  throw new Error("CODEX_RUNTIME_REQUEST_TIMEOUT_MS must be an integer >= 1000");
}

if (!Number.isInteger(codexTurnTimeoutMs) || codexTurnTimeoutMs < 1000) {
  throw new Error("CODEX_RUNTIME_TURN_TIMEOUT_MS must be an integer >= 1000");
}

if (!Number.isInteger(codexInitTimeoutMs) || codexInitTimeoutMs < 1000) {
  throw new Error("CODEX_RUNTIME_INIT_TIMEOUT_MS must be an integer >= 1000");
}

if (!Number.isInteger(codexMaxRestarts) || codexMaxRestarts < 0) {
  throw new Error("CODEX_RUNTIME_MAX_RESTARTS must be a non-negative integer");
}

const bootAt = Date.now();
const bootId = randomUUID();
const hostname = os.hostname();
let requestCount = 0;
let runtimeNotificationCursor = 0;

const sessionStore = new Map();
const turnStore = new Map();
const runtimeNotificationStore = [];
const runtimeNotificationEmitter = new EventEmitter();

const codexClient =
  engine === "codex"
    ? new CodexJsonRpcClient({
        command: String(process.env.CODEX_APP_SERVER_COMMAND || "codex").trim() || "codex",
        args: String(process.env.CODEX_APP_SERVER_ARGS || "app-server"),
        requestTimeoutMs: codexRequestTimeoutMs,
        turnTimeoutMs: codexTurnTimeoutMs,
        initTimeoutMs: codexInitTimeoutMs,
        maxRestarts: codexMaxRestarts,
        autoLoginApiKey: String(process.env.OPENAI_API_KEY || "").trim() || null,
        onStderr: (chunk) => {
          process.stderr.write(chunk);
        }
      })
    : null;

if (codexClient) {
  codexClient.subscribe((notification) => {
    if (
      notification.method === "account/login/completed" ||
      notification.method === "account/updated" ||
      notification.method === "account/rateLimits/updated" ||
      notification.method === "mcpServer/oauthLogin/completed"
    ) {
      publishRuntimeNotification(notification);
    }
  });
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sleep(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function safeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
}

function readIdentifier(url) {
  const identifier = url.searchParams.get("identifier");
  if (!identifier || !identifier.trim()) {
    return null;
  }
  return identifier.trim();
}

function readString(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  return normalized;
}

function writeSseEvent(response, event) {
  response.write(`event: runtime\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function publishRuntimeNotification(notification) {
  runtimeNotificationCursor += 1;
  const event = {
    cursor: runtimeNotificationCursor,
    method: notification.method,
    params: notification.params,
    createdAt: new Date().toISOString()
  };

  runtimeNotificationStore.push(event);
  if (runtimeNotificationStore.length > 500) {
    runtimeNotificationStore.shift();
  }

  runtimeNotificationEmitter.emit("event", event);
}

function ensureSession(identifier) {
  const existing = sessionStore.get(identifier);
  const now = new Date().toISOString();

  if (existing) {
    existing.lastSeenAt = now;
    return existing;
  }

  const created = {
    identifier,
    sessionId: randomUUID(),
    createdAt: now,
    lastSeenAt: now,
    turnCount: 0,
    codexThreadId: null,
    codexBootstrappedAt: null
  };
  sessionStore.set(identifier, created);
  return created;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bufferChunk.byteLength;
    if (size > maxBodyBytes) {
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(bufferChunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const bodyText = Buffer.concat(chunks).toString("utf8");
  if (!bodyText.trim()) {
    return {};
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

async function ensureCodexSessionThread(session) {
  if (!codexClient) {
    return session;
  }

  if (readString(session.codexThreadId)) {
    return session;
  }

  const started = await codexClient.startThread({ cwd: process.cwd() });
  session.codexThreadId = started.threadId;
  session.codexBootstrappedAt = new Date().toISOString();
  return session;
}

async function readRuntimeAccountState({ refreshToken = false } = {}) {
  if (!codexClient) {
    return {
      authMode: null,
      requiresOpenaiAuth: false,
      account: null
    };
  }

  const state = await codexClient.readAccountState({
    refreshToken
  });
  return {
    authMode: state.authMode,
    requiresOpenaiAuth: state.requiresOpenaiAuth,
    account: state.account.raw
  };
}

async function readRuntimeRateLimits() {
  if (!codexClient) {
    return {
      rateLimits: null,
      rateLimitsByLimitId: null
    };
  }

  return await codexClient.readRateLimits();
}

async function runMockTurn(input) {
  const sleepMs = Math.max(0, Math.min(maxSleepMs, safeInteger(input.sleepMs, 0)));
  await sleep(sleepMs);

  return {
    outputText: `Mock response: ${input.text}`,
    runtimeMetadata: {
      engine: "mock",
      sleepMs,
      identifier: input.identifier,
      sessionId: input.session.sessionId
    }
  };
}

async function runTurn(input) {
  if (!codexClient) {
    return runMockTurn(input);
  }

  const isLostThreadError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    return /thread.*(not found|unknown)/iu.test(message);
  };

  let attempt = 0;
  while (attempt < 2) {
    attempt += 1;

    const session = await ensureCodexSessionThread(input.session);
    const codexThreadId = readString(session.codexThreadId);
    if (!codexThreadId) {
      throw new Error("Codex session thread is unavailable");
    }

    try {
      const result = await codexClient.runTurn({
        threadId: codexThreadId,
        turnId: input.turnId,
        text: input.text
      });

      if (result.status === "failed") {
        throw new Error(result.errorMessage || "Codex turn failed");
      }

      return {
        outputText: result.outputText,
        runtimeMetadata: {
          engine: "codex",
          protocol: "jsonrpc-v2",
          status: result.status,
          codexThreadId,
          codexTurnId: result.turnId || input.turnId,
          sessionId: session.sessionId,
          identifier: input.identifier,
          codexPid: codexClient.health().pid
        }
      };
    } catch (error) {
      if (!isLostThreadError(error) || attempt >= 2) {
        throw error;
      }

      session.codexThreadId = null;
      session.codexBootstrappedAt = null;
    }
  }

  throw new Error("Codex turn failed after session recovery attempts");
}

function sendInvalidBodyError(response, error) {
  const message = error instanceof Error ? error.message : "INVALID_REQUEST";
  if (message === "BODY_TOO_LARGE") {
    json(response, 413, {
      code: "BODY_TOO_LARGE",
      message: "Request body exceeds configured limit"
    });
    return;
  }

  json(response, 400, {
    code: "INVALID_JSON",
    message: "Request body must be valid JSON"
  });
}

const server = createServer(async (request, response) => {
  requestCount += 1;
  const url = new URL(request.url || "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, {
      status: "ok",
      bootId,
      bootAt,
      hostname,
      pid: process.pid,
      uptimeMs: Date.now() - bootAt,
      requestCount,
      engine,
      codex: codexClient ? codexClient.health() : null
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/agent/stream") {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive"
    });

    const cursorCandidate = Number(url.searchParams.get("cursor"));
    const cursor = Number.isInteger(cursorCandidate) ? Math.max(0, cursorCandidate) : 0;

    for (const event of runtimeNotificationStore) {
      if (event.cursor > cursor) {
        writeSseEvent(response, event);
      }
    }

    const onRuntimeEvent = (event) => {
      try {
        writeSseEvent(response, event);
      } catch {
        // stream closed
      }
    };

    runtimeNotificationEmitter.on("event", onRuntimeEvent);
    request.on("close", () => {
      runtimeNotificationEmitter.off("event", onRuntimeEvent);
      response.end();
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/account/read") {
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendInvalidBodyError(response, error);
      return;
    }

    try {
      const state = await readRuntimeAccountState({
        refreshToken: body?.refreshToken === true
      });
      json(response, 200, state);
    } catch (error) {
      json(response, 502, {
        code: "RUNTIME_ACCOUNT_READ_FAILED",
        message: error instanceof Error ? error.message : "Runtime account read failed"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/account/login/start") {
    if (!codexClient) {
      json(response, 409, {
        code: "RUNTIME_AUTH_UNSUPPORTED",
        message: "Runtime auth controls are only available in codex mode"
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendInvalidBodyError(response, error);
      return;
    }

    const loginType = readString(body?.type);
    try {
      let result;
      if (loginType === "chatgpt") {
        result = await codexClient.loginStartAccount({
          mode: "chatgpt"
        });
      } else if (loginType === "chatgptAuthTokens") {
        result = await codexClient.loginStartAccount({
          mode: "chatgptAuthTokens",
          accessToken: body?.accessToken,
          chatgptAccountId: body?.chatgptAccountId,
          chatgptPlanType: body?.chatgptPlanType
        });
      } else {
        result = await codexClient.loginStartAccount({
          mode: "apiKey",
          apiKey: body?.apiKey
        });
      }

      json(response, 200, result);
    } catch (error) {
      json(response, 400, {
        code: "RUNTIME_AUTH_LOGIN_FAILED",
        message: error instanceof Error ? error.message : "Runtime login failed"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/account/login/cancel") {
    if (!codexClient) {
      json(response, 409, {
        code: "RUNTIME_AUTH_UNSUPPORTED",
        message: "Runtime auth controls are only available in codex mode"
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendInvalidBodyError(response, error);
      return;
    }

    try {
      const result = await codexClient.loginCancel({
        loginId: body?.loginId
      });
      json(response, 200, result);
    } catch (error) {
      json(response, 400, {
        code: "RUNTIME_AUTH_LOGIN_CANCEL_FAILED",
        message: error instanceof Error ? error.message : "Runtime login cancel failed"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/account/logout") {
    try {
      if (codexClient) {
        await codexClient.logoutAccount();
      }
      json(response, 200, {});
    } catch (error) {
      json(response, 502, {
        code: "RUNTIME_AUTH_LOGOUT_FAILED",
        message: error instanceof Error ? error.message : "Runtime logout failed"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/account/rate-limits/read") {
    try {
      const rateLimits = await readRuntimeRateLimits();
      json(response, 200, rateLimits);
    } catch (error) {
      json(response, 502, {
        code: "RUNTIME_RATE_LIMITS_READ_FAILED",
        message: error instanceof Error ? error.message : "Runtime rate-limit read failed"
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/session/bootstrap") {
    const identifier = readIdentifier(url);
    if (!identifier) {
      json(response, 400, {
        code: "IDENTIFIER_REQUIRED",
        message: "Query param 'identifier' is required"
      });
      return;
    }

    const session = ensureSession(identifier);
    try {
      if (codexClient) {
        await ensureCodexSessionThread(session);
      }
    } catch (error) {
      json(response, 502, {
        code: "RUNTIME_BOOTSTRAP_FAILED",
        message: error instanceof Error ? error.message : "Runtime bootstrap failed"
      });
      return;
    }

    json(response, 200, {
      ok: true,
      session,
      runtime: {
        bootId,
        engine
      }
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/agent/turns/start") {
    const identifier = readIdentifier(url);
    if (!identifier) {
      json(response, 400, {
        code: "IDENTIFIER_REQUIRED",
        message: "Query param 'identifier' is required"
      });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      sendInvalidBodyError(response, error);
      return;
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const turnId =
      typeof body.turnId === "string" && body.turnId.trim() ? body.turnId.trim() : randomUUID();

    if (!text) {
      json(response, 400, {
        code: "TEXT_REQUIRED",
        message: "Body field 'text' is required"
      });
      return;
    }

    const session = ensureSession(identifier);
    session.turnCount += 1;

    const turn = {
      identifier,
      turnId,
      threadId: typeof body.threadId === "string" ? body.threadId : null,
      text,
      status: "inProgress",
      startedAt: new Date().toISOString(),
      completedAt: null,
      outputText: null,
      runtimeMetadata: {
        bootId,
        identifier,
        sessionId: session.sessionId
      }
    };
    turnStore.set(turnId, turn);

    try {
      const result = await runTurn({
        identifier,
        turnId,
        text,
        threadId: turn.threadId,
        sleepMs: body.sleepMs,
        session
      });

      turn.status = "completed";
      turn.completedAt = new Date().toISOString();
      turn.outputText = result.outputText;
      turn.runtimeMetadata = {
        ...turn.runtimeMetadata,
        ...result.runtimeMetadata,
        sessionId: session.sessionId,
        identifier
      };

      json(response, 200, {
        turnId,
        status: turn.status,
        outputText: turn.outputText,
        runtimeMetadata: turn.runtimeMetadata
      });
      return;
    } catch (error) {
      turn.status = "error";
      turn.completedAt = new Date().toISOString();

      json(response, 502, {
        code: "RUNTIME_EXECUTION_FAILED",
        message: error instanceof Error ? error.message : "Runtime execution failed",
        turnId
      });
      return;
    }
  }

  const interruptMatch =
    request.method === "POST" ? /^\/agent\/turns\/([^/]+)\/interrupt$/u.exec(url.pathname) : null;

  if (interruptMatch) {
    const turnId = decodeURIComponent(interruptMatch[1]);
    const turn = turnStore.get(turnId);
    if (!turn) {
      json(response, 404, {
        code: "TURN_NOT_FOUND",
        message: "Turn not found"
      });
      return;
    }

    let interruptResult = {
      interrupted: false,
      reason: "NOT_REQUIRED"
    };

    if (codexClient) {
      try {
        interruptResult = await codexClient.interruptTurn({
          threadId: readString(turn.runtimeMetadata?.codexThreadId),
          turnId: readString(turn.runtimeMetadata?.codexTurnId || turn.turnId)
        });
      } catch (error) {
        json(response, 502, {
          code: "RUNTIME_INTERRUPT_FAILED",
          message: error instanceof Error ? error.message : "Runtime interrupt failed",
          turnId
        });
        return;
      }
    }

    if (turn.status === "inProgress") {
      turn.status = "interrupted";
      turn.completedAt = new Date().toISOString();
    }

    json(response, 200, {
      turnId,
      status: turn.status,
      completedAt: turn.completedAt,
      interrupt: interruptResult
    });
    return;
  }

  json(response, 404, {
    code: "NOT_FOUND",
    message: "Not Found"
  });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    Promise.resolve(codexClient?.stop())
      .catch(() => {})
      .finally(() => {
        server.close(() => {
          process.exit(0);
        });
      });
  });
}

server.listen(port, host, () => {
  console.info(`codex-session-runtime listening on http://${host}:${port} (engine=${engine})`);
});
