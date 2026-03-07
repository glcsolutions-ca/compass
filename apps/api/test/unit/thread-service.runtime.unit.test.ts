import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/modules/auth/auth-service.js";
import { __internalThreadServiceRuntime } from "../../src/modules/threads/thread-service.js";

type RuntimeFetch = typeof fetch;

const {
  MockCloudExecutionDriver,
  UnavailableCloudExecutionDriver,
  ManagedIdentityTokenProvider,
  DynamicSessionsCloudExecutionDriver,
  LocalHttpExecutionDriver,
  parseExecutionMode,
  parseExecutionHost,
  parseFeatureEnabled,
  parsePositiveInteger,
  parseRuntimeProvider,
  resolveDefaultExecutionHost,
  resolveRuntimeProvider,
  buildRuntimeExecutionDriver
} = __internalThreadServiceRuntime;

function toRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function sampleThread() {
  return {
    threadId: "thread-1",
    workspaceId: "workspace-1",
    workspaceSlug: "acme",
    executionMode: "cloud" as const,
    executionHost: "dynamic_sessions" as const,
    status: "idle" as const,
    sessionIdentifier: "thr-thread-1",
    title: null,
    archived: false,
    createdAt: "2026-03-03T00:00:00.000Z",
    updatedAt: "2026-03-03T00:00:00.000Z",
    modeSwitchedAt: null
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}

const envKeys = [
  "IDENTITY_ENDPOINT",
  "IDENTITY_HEADER",
  "MSI_ENDPOINT",
  "MSI_SECRET",
  "AGENT_RUNTIME_PROVIDER",
  "AGENT_CLOUD_DRIVER_MOCK",
  "DYNAMIC_SESSIONS_POOL_MANAGEMENT_ENDPOINT",
  "DYNAMIC_SESSIONS_BEARER_TOKEN",
  "DYNAMIC_SESSIONS_TOKEN_RESOURCE",
  "DYNAMIC_SESSIONS_EXECUTOR_CLIENT_ID"
] as const;

const envSnapshot = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function restoreRuntimeEnv(): void {
  for (const key of envKeys) {
    const value = envSnapshot[key];
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreRuntimeEnv();
});

describe("agent runtime helpers", () => {
  it("parses runtime settings with safe defaults", () => {
    expect(parseExecutionMode("cloud")).toBe("cloud");
    expect(parseExecutionMode("invalid")).toBe("cloud");
    expect(parseExecutionHost("desktop_local")).toBe("desktop_local");
    expect(parseExecutionHost("invalid")).toBe("dynamic_sessions");
    expect(parseFeatureEnabled(" true ", false)).toBe(true);
    expect(parseFeatureEnabled("false", true)).toBe(false);
    expect(parsePositiveInteger("25", 5)).toBe(25);
    expect(parsePositiveInteger("0", 5)).toBe(5);
    expect(parseRuntimeProvider(" local_process ")).toBe("local_process");
    expect(parseRuntimeProvider("unknown")).toBeNull();
    expect(resolveDefaultExecutionHost("local")).toBe("desktop_local");
    expect(resolveDefaultExecutionHost("cloud")).toBe("dynamic_sessions");
  });

  it("resolves runtime providers from environment precedence", () => {
    expect(resolveRuntimeProvider({ AGENT_RUNTIME_PROVIDER: "mock" })).toBe("mock");
    expect(resolveRuntimeProvider({ AGENT_CLOUD_DRIVER_MOCK: "true" })).toBe("mock");
    expect(resolveRuntimeProvider({ AGENT_DEFAULT_EXECUTION_MODE: "local" })).toBe("local_process");
    expect(resolveRuntimeProvider({})).toBe("dynamic_sessions");
  });
});

describe("MockCloudExecutionDriver", () => {
  it("returns deterministic runtime metadata and account payload", async () => {
    const driver = new MockCloudExecutionDriver();

    await expect(driver.bootstrapSession({ thread: sampleThread() })).resolves.toEqual({
      runtimeMetadata: {
        driver: "mock",
        operation: "bootstrap",
        threadId: "thread-1"
      }
    });

    await expect(
      driver.runTurn({
        thread: sampleThread(),
        turnId: "turn-1",
        text: "hello"
      })
    ).resolves.toEqual({
      outputText: "Cloud(dynamic_sessions) response: hello",
      runtimeMetadata: {
        driver: "mock",
        turnId: "turn-1"
      },
      runtime: {
        sessionIdentifier: "thr-thread-1",
        connectionState: "reused",
        runtimeKind: "mock",
        bootId: "mock",
        pid: null
      }
    });

    await expect(
      driver.interruptTurn({
        thread: sampleThread(),
        turnId: "turn-1"
      })
    ).resolves.toMatchObject({
      interrupted: true
    });

    await expect(driver.readAccount()).resolves.toMatchObject({
      provider: "mock",
      account: {
        type: "mock"
      }
    });
    await expect(driver.readRateLimits()).resolves.toEqual({
      rateLimits: null,
      rateLimitsByLimitId: null
    });
    expect(typeof driver.subscribeNotifications(() => {})).toBe("function");
  });

  it("rejects interactive auth operations", async () => {
    const driver = new MockCloudExecutionDriver();

    await expect(driver.loginStart({ type: "chatgpt" })).rejects.toMatchObject({
      code: "AGENT_RUNTIME_PROVIDER_UNSUPPORTED"
    });
    await expect(driver.loginCancel({ loginId: "login-1" })).rejects.toMatchObject({
      code: "AGENT_RUNTIME_PROVIDER_UNSUPPORTED"
    });
    await expect(driver.logout()).rejects.toMatchObject({
      code: "AGENT_RUNTIME_PROVIDER_UNSUPPORTED"
    });
  });
});

describe("UnavailableCloudExecutionDriver", () => {
  it("throws availability errors for every runtime operation", async () => {
    const driver = new UnavailableCloudExecutionDriver({
      provider: "dynamic_sessions",
      reason: "missing endpoint"
    });

    await expect(driver.bootstrapSession({ thread: sampleThread() })).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
    await expect(
      driver.runTurn({
        thread: sampleThread(),
        turnId: "turn-1",
        text: "hello"
      })
    ).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
    await expect(
      driver.interruptTurn({ thread: sampleThread(), turnId: "turn-1" })
    ).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
    await expect(driver.readAccount({ refreshToken: false })).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
    await expect(driver.loginStart({ type: "chatgpt" })).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
    await expect(driver.loginCancel({ loginId: "login-1" })).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
    await expect(driver.logout()).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
    await expect(driver.readRateLimits()).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
    expect(() => driver.subscribeNotifications(() => {})).toThrowError(ApiError);
  });
});

describe("ManagedIdentityTokenProvider", () => {
  it("uses IDENTITY_ENDPOINT and caches tokens", async () => {
    process.env.IDENTITY_ENDPOINT = "http://metadata.local/identity/oauth2/token";
    process.env.IDENTITY_HEADER = "identity-header";

    const fetchMock: RuntimeFetch = vi.fn(async () =>
      jsonResponse({
        access_token: "token-a",
        expires_in: 3600
      })
    ) as unknown as RuntimeFetch;
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ManagedIdentityTokenProvider({
      resource: "https://dynamicsessions.io",
      clientId: "client-id"
    });

    await expect(provider.getToken()).resolves.toBe("token-a");
    await expect(provider.getToken()).resolves.toBe("token-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to MSI endpoint when modern identity vars are absent", async () => {
    delete process.env.IDENTITY_ENDPOINT;
    delete process.env.IDENTITY_HEADER;
    process.env.MSI_ENDPOINT = "http://metadata.local/msi/token";
    process.env.MSI_SECRET = "msi-secret";

    const fetchMock: RuntimeFetch = vi.fn(async () =>
      jsonResponse({
        access_token: "token-b",
        expires_in: 60
      })
    ) as unknown as RuntimeFetch;
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ManagedIdentityTokenProvider({
      resource: "https://dynamicsessions.io",
      clientId: ""
    });

    await expect(provider.getToken()).resolves.toBe("token-b");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when managed identity is not configured", async () => {
    delete process.env.IDENTITY_ENDPOINT;
    delete process.env.IDENTITY_HEADER;
    delete process.env.MSI_ENDPOINT;
    delete process.env.MSI_SECRET;

    const provider = new ManagedIdentityTokenProvider({
      resource: "https://dynamicsessions.io",
      clientId: ""
    });

    await expect(provider.getToken()).rejects.toThrow(
      "Managed identity endpoint is not configured"
    );
  });
});

describe("DynamicSessionsCloudExecutionDriver", () => {
  it("posts bootstrap/turn/interrupt calls with bearer token", async () => {
    const tokenProvider = {
      getToken: vi.fn(async () => "token-123")
    };

    const fetchMock: RuntimeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = toRequestUrl(input);
      if (url.includes("/agent/session/bootstrap")) {
        return jsonResponse({
          runtime: {
            started: true
          }
        });
      }
      if (url.includes("/agent/turns/start")) {
        return jsonResponse({
          outputText: "runtime-output",
          runtimeMetadata: {
            driver: "dynamic_sessions",
            latencyMs: 12
          }
        });
      }

      return jsonResponse({
        status: "interrupted",
        interrupt: {
          interrupted: true,
          driver: "dynamic_sessions"
        }
      });
    }) as unknown as RuntimeFetch;
    vi.stubGlobal("fetch", fetchMock);

    const driver = new DynamicSessionsCloudExecutionDriver({
      endpoint: "https://runtime.example",
      tokenProvider,
      requestTimeoutMs: 3000
    });

    await expect(driver.bootstrapSession({ thread: sampleThread() })).resolves.toMatchObject({
      runtimeMetadata: {
        started: true
      }
    });
    await expect(
      driver.runTurn({
        thread: sampleThread(),
        turnId: "turn-1",
        text: "hello"
      })
    ).resolves.toMatchObject({
      outputText: "runtime-output",
      runtimeMetadata: {
        latencyMs: 12
      }
    });
    await expect(
      driver.interruptTurn({
        thread: sampleThread(),
        turnId: "turn-1"
      })
    ).resolves.toMatchObject({
      interrupted: true
    });

    expect(tokenProvider.getToken).toHaveBeenCalledTimes(3);
  });

  it("maps upstream non-200 responses into runtime request errors", async () => {
    const tokenProvider = {
      getToken: vi.fn(async () => "token-123")
    };

    const fetchMock: RuntimeFetch = vi.fn(
      async () => new Response("boom", { status: 503 })
    ) as unknown as RuntimeFetch;
    vi.stubGlobal("fetch", fetchMock);

    const driver = new DynamicSessionsCloudExecutionDriver({
      endpoint: "https://runtime.example",
      tokenProvider,
      requestTimeoutMs: 3000
    });

    await expect(
      driver.runTurn({
        thread: sampleThread(),
        turnId: "turn-1",
        text: "hello"
      })
    ).rejects.toThrow("Dynamic Sessions runtime request failed (503)");
  });
});

describe("LocalHttpExecutionDriver", () => {
  it("normalizes account and login payloads", async () => {
    const fetchMock: RuntimeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = toRequestUrl(input);
      if (url.includes("/agent/account/read")) {
        return jsonResponse({
          authMode: "chatgpt",
          requiresOpenaiAuth: true,
          account: {
            type: "chatgpt",
            label: "ChatGPT"
          }
        });
      }

      if (url.includes("/agent/account/login/start")) {
        return jsonResponse({
          type: "chatgptAuthTokens",
          loginId: "login-1",
          authUrl: "https://auth.example"
        });
      }

      if (url.includes("/agent/account/login/cancel")) {
        return jsonResponse({
          status: "cancelled"
        });
      }

      if (url.includes("/agent/account/rate-limits/read")) {
        return jsonResponse({
          rateLimits: [],
          rateLimitsByLimitId: {
            "gpt-4o": {
              remaining: 100
            }
          }
        });
      }

      return jsonResponse({});
    }) as unknown as RuntimeFetch;
    vi.stubGlobal("fetch", fetchMock);

    const driver = new LocalHttpExecutionDriver({
      provider: "local_process",
      endpoint: "http://runtime.local",
      requestTimeoutMs: 2500
    });

    await expect(driver.readAccount({ refreshToken: false })).resolves.toMatchObject({
      provider: "local_process",
      authMode: "chatgpt",
      account: {
        label: "ChatGPT"
      }
    });
    await expect(driver.loginStart({ type: "chatgpt" })).resolves.toEqual({
      type: "chatgptAuthTokens",
      loginId: "login-1",
      authUrl: "https://auth.example"
    });
    await expect(driver.loginCancel({ loginId: "login-1" })).resolves.toEqual({
      status: "cancelled"
    });
    await expect(driver.readRateLimits()).resolves.toMatchObject({
      rateLimitsByLimitId: {
        "gpt-4o": {
          remaining: 100
        }
      }
    });
  });

  it("maps runtime auth failures to AGENT_RUNTIME_AUTH_REQUIRED", async () => {
    const fetchMock: RuntimeFetch = vi.fn(async () =>
      jsonResponse(
        {
          code: "RUNTIME_EXECUTION_FAILED",
          message: "Please login to continue"
        },
        401
      )
    ) as unknown as RuntimeFetch;
    vi.stubGlobal("fetch", fetchMock);

    const driver = new LocalHttpExecutionDriver({
      provider: "local_process",
      endpoint: "http://runtime.local",
      requestTimeoutMs: 1000
    });

    await expect(
      driver.runTurn({
        thread: sampleThread(),
        turnId: "turn-1",
        text: "hello"
      })
    ).rejects.toMatchObject({
      status: 401,
      code: "AGENT_RUNTIME_AUTH_REQUIRED"
    });
  });

  it("maps unsupported auth code to AGENT_RUNTIME_PROVIDER_UNSUPPORTED", async () => {
    const fetchMock: RuntimeFetch = vi.fn(async () =>
      jsonResponse(
        {
          code: "RUNTIME_AUTH_UNSUPPORTED",
          message: "Interactive auth is disabled"
        },
        400
      )
    ) as unknown as RuntimeFetch;
    vi.stubGlobal("fetch", fetchMock);

    const driver = new LocalHttpExecutionDriver({
      provider: "local_process",
      endpoint: "http://runtime.local",
      requestTimeoutMs: 1000
    });

    await expect(driver.loginStart({ type: "chatgpt" })).rejects.toMatchObject({
      status: 400,
      code: "AGENT_RUNTIME_PROVIDER_UNSUPPORTED"
    });
  });
});

describe("buildRuntimeExecutionDriver", () => {
  it("builds a mock provider when requested", () => {
    const driver = buildRuntimeExecutionDriver({
      env: {
        AGENT_RUNTIME_PROVIDER: "mock"
      },
      sessionControlPlane: null
    });

    expect(driver.provider).toBe("mock");
  });

  it("builds a local_process provider when local mode is default", () => {
    const driver = buildRuntimeExecutionDriver({
      env: {
        AGENT_RUNTIME_PROVIDER: "local_process",
        AGENT_DEFAULT_EXECUTION_MODE: "local"
      },
      sessionControlPlane: {} as never
    });

    expect(driver.provider).toBe("local_process");
  });

  it("builds unavailable driver for dynamic_sessions without endpoint", async () => {
    const driver = buildRuntimeExecutionDriver({
      env: {
        AGENT_RUNTIME_PROVIDER: "dynamic_sessions"
      },
      sessionControlPlane: null
    });

    await expect(driver.readAccount({ refreshToken: false })).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
  });

  it("builds dynamic_sessions driver when a control plane is configured", () => {
    const driver = buildRuntimeExecutionDriver({
      env: {
        AGENT_RUNTIME_PROVIDER: "dynamic_sessions"
      },
      sessionControlPlane: {} as never
    });

    expect(driver.provider).toBe("dynamic_sessions");
  });
});
