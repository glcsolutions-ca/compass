const apiBaseUrl = String(process.env.API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/u, "");
const executionMode = String(process.env.EXECUTION_MODE ?? "local")
  .trim()
  .toLowerCase();
const executionHost =
  executionMode === "cloud"
    ? "dynamic_sessions"
    : String(process.env.EXECUTION_HOST ?? "desktop_local").trim();

function readSetCookieHeader(response) {
  if (typeof response.headers.getSetCookie === "function") {
    const values = response.headers.getSetCookie();
    if (values.length > 0) {
      return values[0];
    }
  }

  return response.headers.get("set-cookie");
}

function readCookieValue(response) {
  const raw = readSetCookieHeader(response);
  if (!raw) {
    throw new Error("Mock login did not return a session cookie");
  }

  return raw.split(";")[0];
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON response, received: ${text}`);
  }
}

function assertStatus(response, expectedStatus, label) {
  if (response.status !== expectedStatus) {
    throw new Error(`${label} failed with status ${String(response.status)}`);
  }
}

console.log(`Using API base URL: ${apiBaseUrl}`);

const loginResponse = await fetch(`${apiBaseUrl}/v1/auth/entra/start?returnTo=%2Fchat`, {
  redirect: "manual"
});
assertStatus(loginResponse, 302, "mock login");
const sessionCookie = readCookieValue(loginResponse);
console.log(`Authenticated with cookie: ${sessionCookie.split("=")[0]}`);

const authMeResponse = await fetch(`${apiBaseUrl}/v1/auth/me`, {
  headers: {
    cookie: sessionCookie
  }
});
assertStatus(authMeResponse, 200, "read auth me");
const authMe = await readJson(authMeResponse);
const workspaceSlug = authMe?.personalWorkspaceSlug ?? authMe?.activeWorkspaceSlug;
if (typeof workspaceSlug !== "string" || workspaceSlug.length === 0) {
  throw new Error("Auth me response did not include a usable workspace slug");
}

const createThreadResponse = await fetch(`${apiBaseUrl}/v1/threads`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    cookie: sessionCookie,
    origin: apiBaseUrl
  },
  body: JSON.stringify({
    workspaceSlug,
    executionMode,
    executionHost,
    title: "Prototype smoke thread"
  })
});
assertStatus(createThreadResponse, 201, "create thread");
const created = await readJson(createThreadResponse);
const threadId = created?.thread?.threadId;
if (typeof threadId !== "string" || threadId.length === 0) {
  throw new Error("create thread response did not include threadId");
}
console.log(`Created thread ${threadId}`);

async function sendMessage(text) {
  const response = await fetch(`${apiBaseUrl}/v1/threads/${threadId}/turns`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie,
      origin: apiBaseUrl
    },
    body: JSON.stringify({ text })
  });
  assertStatus(response, 200, `send message (${text})`);
  return await readJson(response);
}

const first = await sendMessage("hello from smoke");
const second = await sendMessage("second pass");

if (first?.outputText !== "echo:hello from smoke") {
  throw new Error(`Unexpected first assistant response: ${JSON.stringify(first)}`);
}

if (second?.outputText !== "echo:second pass") {
  throw new Error(`Unexpected second assistant response: ${JSON.stringify(second)}`);
}

if (first?.runtime?.connectionState !== "bootstrapped") {
  throw new Error(
    `Expected first runtime connectionState=bootstrapped, received ${JSON.stringify(first?.runtime)}`
  );
}

if (second?.runtime?.connectionState !== "reused") {
  throw new Error(
    `Expected second runtime connectionState=reused, received ${JSON.stringify(second?.runtime)}`
  );
}

if (first?.runtime?.sessionIdentifier !== second?.runtime?.sessionIdentifier) {
  throw new Error("Expected the second request to reuse the first session");
}

const threadResponse = await fetch(`${apiBaseUrl}/v1/threads/${threadId}`, {
  headers: {
    cookie: sessionCookie
  }
});
assertStatus(threadResponse, 200, "read thread");
const thread = await readJson(threadResponse);
if (thread?.thread?.sessionIdentifier !== second?.runtime?.sessionIdentifier) {
  throw new Error(
    `Expected thread session identifier to match runtime, received ${JSON.stringify(thread)}`
  );
}

console.log("Smoke test passed");
console.log(
  JSON.stringify(
    {
      threadId,
      sessionIdentifier: second.runtime.sessionIdentifier,
      firstConnectionState: first.runtime.connectionState,
      secondConnectionState: second.runtime.connectionState
    },
    null,
    2
  )
);
