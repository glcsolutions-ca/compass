import { describe, expect, it, vi } from "vitest";
import { __internalAgentServiceRuntime } from "./agent-service.js";

const { PostgresAgentService } = __internalAgentServiceRuntime;

function createThreadRow(overrides: Record<string, unknown> = {}) {
  return {
    thread_id: "thread-1",
    workspace_id: "workspace-1",
    workspace_slug: "acme",
    execution_mode: "cloud",
    execution_host: "dynamic_sessions",
    status: "idle",
    cloud_session_identifier: "thr-thread-1",
    title: "Thread title",
    archived: false,
    created_at: "2026-03-03T00:00:00.000Z",
    updated_at: "2026-03-03T00:00:00.000Z",
    mode_switched_at: null,
    ...overrides
  };
}

function createTurnRow(overrides: Record<string, unknown> = {}) {
  return {
    turn_id: "turn-1",
    thread_id: "thread-1",
    parent_turn_id: null,
    source_turn_id: null,
    client_request_id: "request-1",
    status: "completed",
    execution_mode: "cloud",
    execution_host: "dynamic_sessions",
    input: { text: "hello" },
    output: { text: "done" },
    error: null,
    started_at: "2026-03-03T00:00:00.000Z",
    completed_at: "2026-03-03T00:00:01.000Z",
    ...overrides
  };
}

function createEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    thread_id: "thread-1",
    turn_id: null,
    method: "thread.started",
    payload: {},
    created_at: "2026-03-03T00:00:00.000Z",
    ...overrides
  };
}

function createRuntimeDriver(overrides: Record<string, unknown> = {}) {
  const driver = {
    provider: "mock",
    capabilities: {
      interactiveAuth: false,
      supportsChatgptManaged: false,
      supportsApiKey: false,
      supportsChatgptAuthTokens: false,
      supportsRateLimits: false,
      supportsRuntimeStream: false
    },
    bootstrapSession: vi.fn(async () => ({
      runtimeMetadata: { started: true }
    })),
    runTurn: vi.fn(async () => ({
      outputText: "runtime-output",
      runtimeMetadata: { source: "runtime" }
    })),
    interruptTurn: vi.fn(async () => ({
      interrupted: true,
      runtimeMetadata: { interrupted: true }
    })),
    readAccount: vi.fn(async () => ({
      provider: "mock",
      capabilities: {
        interactiveAuth: false,
        supportsChatgptManaged: false,
        supportsApiKey: false,
        supportsChatgptAuthTokens: false,
        supportsRateLimits: false,
        supportsRuntimeStream: false
      },
      authMode: null,
      requiresOpenaiAuth: false,
      account: null
    })),
    loginStart: vi.fn(async () => ({
      type: "chatgpt",
      loginId: "login-1",
      authUrl: "https://auth.example"
    })),
    loginCancel: vi.fn(async () => ({
      status: "cancelled"
    })),
    logout: vi.fn(async () => ({})),
    readRateLimits: vi.fn(async () => ({
      rateLimits: null,
      rateLimitsByLimitId: null
    })),
    subscribeNotifications: vi.fn(() => () => {}),
    ...overrides
  };

  return driver;
}

describe("PostgresAgentService", () => {
  it("lists threads through workspace membership lookup", async () => {
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ workspace_id: "workspace-1", workspace_slug: "acme" }]
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [createThreadRow()]
        }),
      connect: vi.fn(),
      end: vi.fn(async () => {})
    };

    const service = new PostgresAgentService({
      pool: pool as never,
      runtimeExecutionDriver: createRuntimeDriver() as never
    });

    const threads = await service.listThreads({
      userId: "usr-1",
      workspaceSlug: "acme",
      state: "regular",
      limit: 25
    });

    expect(threads).toHaveLength(1);
    expect(threads[0]?.threadId).toBe("thread-1");
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("creates a thread, bootstraps runtime, and publishes a started event", async () => {
    const runtimeDriver = createRuntimeDriver();
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ workspace_id: "workspace-1", workspace_slug: "acme" }]
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [createThreadRow({ title: "New Thread" })]
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [createEventRow({ id: 7, method: "thread.started" })]
        }),
      connect: vi.fn(),
      end: vi.fn(async () => {})
    };

    const service = new PostgresAgentService({
      pool: pool as never,
      runtimeExecutionDriver: runtimeDriver as never
    });

    const receivedEvents: string[] = [];
    const unsubscribe = service.subscribeThreadEvents("thread-1", (event) => {
      receivedEvents.push(event.method);
    });

    const thread = await service.createThread({
      userId: "usr-1",
      workspaceSlug: "acme",
      executionMode: "cloud",
      now: new Date("2026-03-03T00:00:00.000Z"),
      title: "New Thread"
    });

    unsubscribe();
    expect(thread.title).toBe("New Thread");
    expect(runtimeDriver.bootstrapSession).toHaveBeenCalledTimes(1);
    expect(receivedEvents).toContain("thread.started");
  });

  it("rejects empty updates and rolls back transaction", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [createThreadRow()]
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ exists: true }]
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      release: vi.fn()
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn(async () => client),
      end: vi.fn(async () => {})
    };

    const service = new PostgresAgentService({
      pool: pool as never,
      runtimeExecutionDriver: createRuntimeDriver() as never
    });

    await expect(
      service.updateThread({
        userId: "usr-1",
        threadId: "thread-1",
        now: new Date("2026-03-03T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_REQUEST"
    });
    expect(client.query).toHaveBeenCalledWith("rollback");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("rejects mode switches when a turn is in progress", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [createThreadRow()]
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ exists: true }]
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ busy: true }]
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      release: vi.fn()
    };
    const pool = {
      query: vi.fn(),
      connect: vi.fn(async () => client),
      end: vi.fn(async () => {})
    };

    const service = new PostgresAgentService({
      pool: pool as never,
      runtimeExecutionDriver: createRuntimeDriver() as never
    });

    await expect(
      service.switchThreadMode({
        userId: "usr-1",
        threadId: "thread-1",
        executionMode: "cloud",
        now: new Date("2026-03-03T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      status: 409,
      code: "AGENT_THREAD_BUSY"
    });
    expect(client.query).toHaveBeenCalledWith("rollback");
  });

  it("returns existing turns for duplicate client request IDs", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [createTurnRow()]
        })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      release: vi.fn()
    };
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [createThreadRow()]
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ exists: true }]
        }),
      connect: vi.fn(async () => client),
      end: vi.fn(async () => {})
    };

    const service = new PostgresAgentService({
      pool: pool as never,
      runtimeExecutionDriver: createRuntimeDriver() as never
    });

    const result = await service.startTurn({
      userId: "usr-1",
      threadId: "thread-1",
      text: "Hello",
      clientRequestId: "request-1",
      now: new Date("2026-03-03T00:00:00.000Z")
    });

    expect(result.turn.turnId).toBe("turn-1");
    expect(result.outputText).toBe("done");
  });

  it("surfaces runtime account failures as AGENT_RUNTIME_UNAVAILABLE", async () => {
    const runtimeDriver = createRuntimeDriver({
      readAccount: vi.fn(async () => {
        throw new Error("runtime unavailable");
      })
    });
    const pool = {
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(async () => {})
    };

    const service = new PostgresAgentService({
      pool: pool as never,
      runtimeExecutionDriver: runtimeDriver as never
    });

    await expect(
      service.readRuntimeAccountState({
        userId: "usr-1",
        refreshToken: true
      })
    ).rejects.toMatchObject({
      status: 503,
      code: "AGENT_RUNTIME_UNAVAILABLE"
    });
  });

  it("buffers runtime notifications and supports cursor+limit reads", async () => {
    let runtimeHandler:
      | ((notification: { method: "account/updated"; params: unknown }) => void)
      | null = null;
    const runtimeDriver = createRuntimeDriver({
      subscribeNotifications: vi.fn((handler: typeof runtimeHandler) => {
        runtimeHandler = handler;
        return () => {
          runtimeHandler = null;
        };
      })
    });
    const pool = {
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(async () => {})
    };

    const service = new PostgresAgentService({
      pool: pool as never,
      runtimeExecutionDriver: runtimeDriver as never
    });

    if (!runtimeHandler) {
      throw new Error("expected runtime notification handler to be registered");
    }
    runtimeHandler({ method: "account/updated", params: { sequence: 1 } });
    runtimeHandler({ method: "account/updated", params: { sequence: 2 } });
    runtimeHandler({ method: "account/updated", params: { sequence: 3 } });

    const latestTwo = await service.listRuntimeNotifications({
      userId: "usr-1",
      cursor: 0,
      limit: 2
    });

    expect(latestTwo).toHaveLength(2);
    expect(latestTwo[0]?.cursor).toBe(2);
    expect(latestTwo[1]?.cursor).toBe(3);
  });

  it("closes runtime subscription and pool cleanly", async () => {
    const unsubscribe = vi.fn();
    const runtimeDriver = createRuntimeDriver({
      subscribeNotifications: vi.fn(() => unsubscribe)
    });
    const pool = {
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(async () => {})
    };

    const service = new PostgresAgentService({
      pool: pool as never,
      runtimeExecutionDriver: runtimeDriver as never
    });
    await service.close();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("rejects local execution mode immediately", async () => {
    const service = new PostgresAgentService({
      pool: {
        query: vi.fn(),
        connect: vi.fn(),
        end: vi.fn(async () => {})
      } as never,
      runtimeExecutionDriver: createRuntimeDriver() as never
    });

    await expect(
      service.switchThreadMode({
        userId: "usr-1",
        threadId: "thread-1",
        executionMode: "local",
        now: new Date("2026-03-03T00:00:00.000Z")
      })
    ).rejects.toMatchObject({
      code: "AGENT_LOCAL_MODE_NOT_IMPLEMENTED"
    });
  });
});
