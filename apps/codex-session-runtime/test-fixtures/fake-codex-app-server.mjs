import { existsSync, writeFileSync } from "node:fs";

let nextThreadId = 1;
let nextTurnId = 1;
let initialized = false;
let loggedIn = true;
const threads = new Map();

if (
  String(process.env.FAKE_CODEX_REQUIRE_LOGIN || "")
    .trim()
    .toLowerCase() === "true"
) {
  loggedIn = false;
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`, "utf8");
}

function sendResponse(id, result) {
  send({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id, code, message) {
  send({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

function sendNotification(method, params) {
  send({
    jsonrpc: "2.0",
    method,
    params
  });
}

function readInputText(params) {
  const input = Array.isArray(params?.input) ? params.input : [];
  const textItem = input.find(
    (value) => value && typeof value === "object" && value.type === "text"
  );
  const text = typeof textItem?.text === "string" ? textItem.text : "";
  return text;
}

function buildThread(threadId, cwd) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    id: threadId,
    preview: "fake thread",
    modelProvider: "openai",
    createdAt: nowSeconds,
    updatedAt: nowSeconds,
    status: "idle",
    path: null,
    cwd,
    cliVersion: "0.106.0",
    source: "app-server",
    agentNickname: null,
    agentRole: null,
    gitInfo: null,
    turns: []
  };
}

function maybeCrashBeforeTurnStart() {
  const crashMarkerPath = String(process.env.FAKE_CODEX_CRASH_MARKER_FILE || "").trim();
  if (!crashMarkerPath) {
    return;
  }

  if (existsSync(crashMarkerPath)) {
    return;
  }

  writeFileSync(crashMarkerPath, "crashed-once\n", "utf8");
  process.exit(1);
}

function handleRequest(request) {
  const id = request?.id;
  const method = String(request?.method || "");
  const params = request?.params || {};

  if (method === "initialize") {
    sendResponse(id, {
      userAgent: "fake-codex-app-server/0.1.0"
    });
    return;
  }

  if (method === "initialized") {
    initialized = true;
    return;
  }

  if (!initialized) {
    sendError(id, -32001, "Server not initialized");
    return;
  }

  if (method === "account/read") {
    sendResponse(id, {
      account: loggedIn
        ? {
            type: "apiKey"
          }
        : null,
      requiresOpenaiAuth: !loggedIn
    });
    return;
  }

  if (method === "account/login/start") {
    const loginType = String(params?.type || "");

    if (loginType === "apiKey") {
      loggedIn = true;
      sendResponse(id, {
        type: "apiKey"
      });
      sendNotification("account/login/completed", {
        loginId: null,
        success: true,
        error: null
      });
      sendNotification("account/updated", {
        authMode: "apiKey"
      });
      return;
    }

    if (loginType === "chatgpt") {
      const loginId = `login-${Date.now().toString(36)}`;
      sendResponse(id, {
        type: "chatgpt",
        loginId,
        authUrl: "https://example.com/fake-chatgpt-login"
      });

      if (
        String(process.env.FAKE_CODEX_AUTO_COMPLETE_CHATGPT || "")
          .trim()
          .toLowerCase() === "true"
      ) {
        loggedIn = true;
        sendNotification("account/login/completed", {
          loginId,
          success: true,
          error: null
        });
        sendNotification("account/updated", {
          authMode: "chatgpt"
        });
      }
      return;
    }

    sendError(id, -32602, "Unsupported login mode");
    return;
  }

  if (method === "thread/start") {
    const threadId = `fake-thread-${String(nextThreadId++)}`;
    const cwd = typeof params?.cwd === "string" && params.cwd ? params.cwd : process.cwd();
    const thread = buildThread(threadId, cwd);
    threads.set(threadId, thread);

    sendResponse(id, {
      thread,
      model: "gpt-5-codex",
      modelProvider: "openai",
      cwd,
      approvalPolicy: "never",
      sandbox: {
        mode: "workspace-write"
      },
      reasoningEffort: null
    });
    sendNotification("thread/started", {
      thread
    });
    return;
  }

  if (method === "thread/read") {
    const threadId = String(params?.threadId || "");
    const thread = threads.get(threadId);

    if (!thread) {
      sendError(id, -32004, "Thread not found");
      return;
    }

    sendResponse(id, {
      thread
    });
    return;
  }

  if (method === "turn/start") {
    maybeCrashBeforeTurnStart();

    const threadId = String(params?.threadId || "");
    if (!threads.has(threadId)) {
      sendError(id, -32004, "Thread not found");
      return;
    }

    const turnId = `fake-turn-${String(nextTurnId++)}`;
    const text = readInputText(params);

    sendResponse(id, {
      turn: {
        id: turnId,
        items: [],
        status: "inProgress",
        error: null
      }
    });

    setTimeout(() => {
      sendNotification("turn/started", {
        threadId,
        turn: {
          id: turnId,
          items: [],
          status: "inProgress",
          error: null
        }
      });

      sendNotification("item/agentMessage/delta", {
        threadId,
        turnId,
        itemId: `item-${turnId}`,
        delta: `Fake response: ${text}`
      });

      sendNotification("turn/completed", {
        threadId,
        turn: {
          id: turnId,
          items: [],
          status: "completed",
          error: null
        }
      });
    }, 5);

    return;
  }

  if (method === "turn/interrupt") {
    sendResponse(id, {});
    return;
  }

  if (method === "account/logout") {
    loggedIn = false;
    sendResponse(id, {});
    sendNotification("account/updated", {
      authMode: null
    });
    return;
  }

  sendError(id, -32601, `Method not found: ${method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;

  while (true) {
    const newlineIndex = buffer.indexOf("\n");
    if (newlineIndex < 0) {
      break;
    }

    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (!line) {
      continue;
    }

    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }

    handleRequest(request);
  }
});
