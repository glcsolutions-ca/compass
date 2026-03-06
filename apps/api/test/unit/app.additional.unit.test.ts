import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApiApp } from "../../src/app.js";
import { ApiError } from "../../src/auth-service.js";
import type { AuthService } from "../../src/auth-service.js";
import type { AgentService } from "../../src/agent-service.js";

function activeSessionRecord() {
  return {
    authenticated: true,
    user: { id: "usr-1" }
  };
}

describe("API app additional route coverage", () => {
  it("starts admin consent and redirects", async () => {
    const startAdminConsent = vi.fn(async () => ({
      redirectUrl: "https://login.microsoftonline.com/adminconsent"
    }));
    const app = buildApiApp({
      authService: {
        startAdminConsent
      } as unknown as AuthService
    });

    const response = await request(app)
      .get("/v1/auth/entra/admin-consent/start")
      .set("x-forwarded-host", "compass.glcsolutions.ca")
      .set("x-forwarded-proto", "https");
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("adminconsent");
    expect(startAdminConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: "https://compass.glcsolutions.ca/v1/auth/entra/callback"
      })
    );
  });

  it("handles entra callback success and sets session cookie", async () => {
    const handleEntraCallback = vi.fn(async () => ({
      redirectTo: "/chat",
      sessionToken: "session-1"
    }));
    const app = buildApiApp({
      authService: {
        handleEntraCallback,
        createSessionCookie: vi.fn(() => "__Host-compass_session=session-1; Path=/; HttpOnly")
      } as unknown as AuthService
    });

    const response = await request(app)
      .get("/v1/auth/entra/callback?state=s1&code=c1")
      .set("x-forwarded-host", "compass.glcsolutions.ca")
      .set("x-forwarded-proto", "https");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/chat");
    expect(response.headers["set-cookie"]?.[0]).toContain("__Host-compass_session");
    expect(handleEntraCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: "https://compass.glcsolutions.ca/v1/auth/entra/callback"
      })
    );
  });

  it("completes desktop auth callback and redirects", async () => {
    const app = buildApiApp({
      authService: {
        completeDesktopLogin: vi.fn(async () => ({
          redirectTo: "/chat",
          sessionToken: "session-1"
        })),
        createSessionCookie: vi.fn(() => "__Host-compass_session=session-1; Path=/; HttpOnly")
      } as unknown as AuthService
    });

    const response = await request(app).get("/v1/auth/desktop/complete?handoff=handoff-1");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/chat");
  });

  it("returns auth me payload when configured", async () => {
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => ({
          authenticated: true,
          user: {
            id: "usr-1",
            primaryEmail: "owner@acme.test",
            displayName: "Owner User"
          },
          organizations: [],
          workspaces: [],
          activeWorkspaceSlug: null,
          personalWorkspaceSlug: null
        }))
      } as unknown as AuthService
    });

    const response = await request(app).get("/v1/auth/me");
    expect(response.status).toBe(200);
    expect(response.body.authenticated).toBe(true);
  });

  it("returns auth not configured when auth endpoints are disabled", async () => {
    const app = buildApiApp();
    const response = await request(app).get("/v1/auth/me");
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AUTH_NOT_CONFIGURED");
  });

  it("returns auth not configured across all auth-dependent routes", async () => {
    const app = buildApiApp();

    const scenarios: Array<{
      method: "get" | "post";
      path: string;
      body?: Record<string, unknown>;
    }> = [
      { method: "get", path: "/v1/auth/entra/start" },
      { method: "get", path: "/v1/auth/entra/admin-consent/start" },
      { method: "get", path: "/v1/auth/entra/callback?state=s1&code=c1" },
      { method: "get", path: "/v1/auth/desktop/complete?handoff=h1" },
      { method: "post", path: "/v1/auth/logout" },
      { method: "post", path: "/v1/workspaces", body: { name: "Acme", slug: "acme" } },
      { method: "get", path: "/v1/workspaces/acme" },
      { method: "get", path: "/v1/workspaces/acme/members" },
      {
        method: "post",
        path: "/v1/workspaces/acme/invites",
        body: { email: "owner@acme.test", role: "member" }
      },
      { method: "post", path: "/v1/workspaces/acme/invites/token-1/accept" }
    ];

    for (const scenario of scenarios) {
      const requestBuilder =
        scenario.method === "get"
          ? request(app).get(scenario.path)
          : request(app).post(scenario.path);
      const response = scenario.body
        ? await requestBuilder.send(scenario.body)
        : await requestBuilder;
      expect(response.status).toBe(503);
      expect(response.body.code).toBe("AUTH_NOT_CONFIGURED");
    }
  });

  it("logs auth failures with structured payload", async () => {
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = buildApiApp({
        authService: {
          logout: vi.fn(() => Promise.reject(new Error("logout failed")))
        } as unknown as AuthService
      });

      const response = await request(app).post("/v1/auth/logout");
      expect(response.status).toBe(500);
      expect(response.body.code).toBe("INTERNAL_SERVER_ERROR");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"message":"logout failed"'));
    } finally {
      logSpy.mockRestore();
    }
  });

  it("creates, reads, and lists workspace members", async () => {
    const app = buildApiApp({
      authService: {
        createWorkspace: vi.fn(async () => ({
          workspace: {
            id: "ws-1",
            slug: "acme",
            name: "Acme",
            organizationId: "org-1",
            organizationSlug: "acme",
            organizationName: "Acme",
            isPersonal: false,
            status: "active"
          },
          membership: {
            role: "admin",
            status: "active"
          }
        })),
        readWorkspace: vi.fn(async () => ({
          workspace: {
            id: "ws-1",
            slug: "acme",
            name: "Acme",
            organizationId: "org-1",
            organizationSlug: "acme",
            organizationName: "Acme",
            isPersonal: false,
            status: "active"
          }
        })),
        listWorkspaceMembers: vi.fn(async () => ({
          members: [
            {
              userId: "usr-1",
              primaryEmail: "owner@acme.test",
              displayName: "Owner User",
              role: "admin",
              status: "active"
            }
          ]
        }))
      } as unknown as AuthService
    });

    const createResponse = await request(app).post("/v1/workspaces").send({
      name: "Acme",
      slug: "acme"
    });
    expect(createResponse.status).toBe(201);

    const readResponse = await request(app).get("/v1/workspaces/acme");
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.workspace.slug).toBe("acme");

    const membersResponse = await request(app).get("/v1/workspaces/acme/members");
    expect(membersResponse.status).toBe(200);
    expect(membersResponse.body.members).toHaveLength(1);
  });

  it("creates and accepts workspace invites", async () => {
    const app = buildApiApp({
      authService: {
        createWorkspaceInvite: vi.fn(async () => ({
          inviteId: "invite-1",
          expiresAt: "2026-03-10T00:00:00.000Z",
          token: "token-1"
        })),
        acceptWorkspaceInvite: vi.fn(async () => ({
          joined: true,
          workspaceSlug: "acme",
          role: "member",
          status: "active"
        }))
      } as unknown as AuthService
    });

    const createResponse = await request(app)
      .post("/v1/workspaces/acme/invites")
      .send({ email: "owner@acme.test", role: "member" });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.inviteId).toBe("invite-1");

    const acceptResponse = await request(app).post("/v1/workspaces/acme/invites/token-1/accept");
    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.joined).toBe(true);
  });

  it("rejects agent requests when auth me is not authenticated", async () => {
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => ({
          authenticated: false
        }))
      } as unknown as AuthService,
      agentService: {
        listThreads: vi.fn()
      } as unknown as AgentService,
      agentGatewayEnabled: true,
      agentCloudModeEnabled: true
    });

    const response = await request(app).get("/v1/agent/threads").query({ workspaceSlug: "acme" });
    expect(response.status).toBe(401);
    expect(response.body.code).toBe("UNAUTHORIZED");
  });

  it("returns AGENT_GATEWAY_NOT_CONFIGURED when service dependencies are missing", async () => {
    const app = buildApiApp({
      agentGatewayEnabled: true
    });

    const response = await request(app)
      .post("/v1/agent/threads")
      .send({ workspaceSlug: "acme", executionMode: "cloud" });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AGENT_GATEWAY_NOT_CONFIGURED");
  });

  it("handles thread read, interrupt, batch events, and event listing", async () => {
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => activeSessionRecord())
      } as unknown as AuthService,
      agentService: {
        readThread: vi.fn(async () => ({
          threadId: "thread-1",
          workspaceId: "workspace-1",
          workspaceSlug: "acme",
          executionMode: "cloud",
          executionHost: "dynamic_sessions",
          status: "idle",
          sessionIdentifier: "thr-thread-1",
          title: null,
          archived: false,
          createdAt: "2026-03-03T00:00:00.000Z",
          updatedAt: "2026-03-03T00:00:00.000Z",
          modeSwitchedAt: null
        })),
        interruptTurn: vi.fn(async () => ({
          turnId: "turn-1",
          threadId: "thread-1",
          parentTurnId: null,
          sourceTurnId: null,
          clientRequestId: "request-1",
          status: "interrupted",
          executionMode: "cloud",
          executionHost: "dynamic_sessions",
          input: {},
          output: {},
          error: null,
          startedAt: "2026-03-03T00:00:00.000Z",
          completedAt: "2026-03-03T00:00:01.000Z"
        })),
        appendThreadEventsBatch: vi.fn(async () => ({
          accepted: 1
        })),
        listThreadEvents: vi.fn(async () => [
          {
            cursor: 1,
            threadId: "thread-1",
            turnId: null,
            method: "thread.started",
            payload: {},
            createdAt: "2026-03-03T00:00:00.000Z"
          }
        ])
      } as unknown as AgentService,
      agentGatewayEnabled: true,
      agentCloudModeEnabled: true
    });

    const readResponse = await request(app).get("/v1/agent/threads/thread-1");
    expect(readResponse.status).toBe(200);

    const interruptResponse = await request(app).post(
      "/v1/agent/threads/thread-1/turns/turn-1/interrupt"
    );
    expect(interruptResponse.status).toBe(200);

    const batchResponse = await request(app)
      .post("/v1/agent/threads/thread-1/events:batch")
      .send({ events: [{ method: "thread.started", payload: {} }] });
    expect(batchResponse.status).toBe(200);

    const eventsResponse = await request(app)
      .get("/v1/agent/threads/thread-1/events")
      .query({ cursor: 0, limit: 50 });
    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.body.events).toHaveLength(1);
  });

  it("returns upgrade required for runtime stream endpoint", async () => {
    const app = buildApiApp();
    const response = await request(app).get("/v1/agent/runtime/stream");
    expect(response.status).toBe(426);
    expect(response.body.code).toBe("UPGRADE_REQUIRED");
  });

  it("returns request validation errors for malformed agent payloads", async () => {
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => activeSessionRecord())
      } as unknown as AuthService,
      agentService: {
        startTurn: vi.fn()
      } as unknown as AgentService,
      agentGatewayEnabled: true,
      agentCloudModeEnabled: true
    });

    const response = await request(app).post("/v1/agent/threads/thread-1/turns").send({
      clientRequestId: "missing-text"
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
  });

  it("maps auth service errors from agent context helper", async () => {
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => {
          throw new ApiError(403, "WORKSPACE_FORBIDDEN", "No access");
        })
      } as unknown as AuthService,
      agentService: {
        listThreads: vi.fn()
      } as unknown as AgentService,
      agentGatewayEnabled: true
    });

    const response = await request(app).get("/v1/agent/threads").query({ workspaceSlug: "acme" });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("WORKSPACE_FORBIDDEN");
  });

  it("handles runtime account read/login/cancel/logout/rate-limit endpoints", async () => {
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => activeSessionRecord())
      } as unknown as AuthService,
      agentService: {
        readRuntimeAccountState: vi.fn(async () => ({
          provider: "dynamic_sessions",
          capabilities: {
            interactiveAuth: true,
            supportsChatgptManaged: true,
            supportsApiKey: true,
            supportsChatgptAuthTokens: true,
            supportsRateLimits: true,
            supportsRuntimeStream: true
          },
          authMode: "chatgpt",
          requiresOpenaiAuth: true,
          account: null
        })),
        startRuntimeAccountLogin: vi.fn(async () => ({
          type: "chatgpt",
          loginId: "login-1",
          authUrl: "https://example.com/login"
        })),
        cancelRuntimeAccountLogin: vi.fn(async () => ({ status: "cancelled" })),
        logoutRuntimeAccount: vi.fn(async () => ({})),
        readRuntimeRateLimits: vi.fn(async () => ({ rateLimits: null, rateLimitsByLimitId: null }))
      } as unknown as AgentService,
      agentGatewayEnabled: true,
      agentCloudModeEnabled: true
    });

    const readResponse = await request(app)
      .post("/v1/agent/runtime/account/read")
      .send({ refreshToken: true });
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.provider).toBe("dynamic_sessions");

    const loginStartResponse = await request(app)
      .post("/v1/agent/runtime/account/login/start")
      .send({ type: "chatgpt" });
    expect(loginStartResponse.status).toBe(200);
    expect(loginStartResponse.body.loginId).toBe("login-1");

    const loginCancelResponse = await request(app)
      .post("/v1/agent/runtime/account/login/cancel")
      .send({ loginId: "login-1" });
    expect(loginCancelResponse.status).toBe(200);
    expect(loginCancelResponse.body.status).toBe("cancelled");

    const logoutResponse = await request(app).post("/v1/agent/runtime/account/logout").send({});
    expect(logoutResponse.status).toBe(200);

    const rateLimitsResponse = await request(app)
      .post("/v1/agent/runtime/account/rate-limits/read")
      .send({});
    expect(rateLimitsResponse.status).toBe(200);
    expect(rateLimitsResponse.body.rateLimits).toBeNull();
  });

  it("returns validation errors for malformed runtime account requests", async () => {
    const readRuntimeAccountState = vi.fn();
    const startRuntimeAccountLogin = vi.fn();
    const cancelRuntimeAccountLogin = vi.fn();
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => activeSessionRecord())
      } as unknown as AuthService,
      agentService: {
        readRuntimeAccountState,
        startRuntimeAccountLogin,
        cancelRuntimeAccountLogin
      } as unknown as AgentService,
      agentGatewayEnabled: true,
      agentCloudModeEnabled: true
    });

    const readResponse = await request(app)
      .post("/v1/agent/runtime/account/read")
      .send({ refreshToken: "yes" });
    expect(readResponse.status).toBe(400);
    expect(readResponse.body.code).toBe("INVALID_REQUEST");

    const loginStartResponse = await request(app)
      .post("/v1/agent/runtime/account/login/start")
      .send({ type: "apiKey" });
    expect(loginStartResponse.status).toBe(400);
    expect(loginStartResponse.body.code).toBe("INVALID_REQUEST");

    const loginCancelResponse = await request(app)
      .post("/v1/agent/runtime/account/login/cancel")
      .send({});
    expect(loginCancelResponse.status).toBe(400);
    expect(loginCancelResponse.body.code).toBe("INVALID_REQUEST");

    expect(readRuntimeAccountState).not.toHaveBeenCalled();
    expect(startRuntimeAccountLogin).not.toHaveBeenCalled();
    expect(cancelRuntimeAccountLogin).not.toHaveBeenCalled();
  });

  it("enforces cloud/local execution-mode feature gates", async () => {
    const createThread = vi.fn();
    const startTurn = vi.fn();
    const switchThreadMode = vi.fn();
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => activeSessionRecord())
      } as unknown as AuthService,
      agentService: {
        createThread,
        startTurn,
        switchThreadMode
      } as unknown as AgentService,
      agentGatewayEnabled: true,
      agentCloudModeEnabled: false,
      agentLocalModeEnabledDesktop: false,
      agentModeSwitchEnabled: true
    });

    const createCloud = await request(app).post("/v1/agent/threads").send({
      workspaceSlug: "acme",
      executionMode: "cloud"
    });
    expect(createCloud.status).toBe(503);
    expect(createCloud.body.code).toBe("AGENT_CLOUD_MODE_DISABLED");

    const createLocal = await request(app).post("/v1/agent/threads").send({
      workspaceSlug: "acme",
      executionMode: "local"
    });
    expect(createLocal.status).toBe(503);
    expect(createLocal.body.code).toBe("AGENT_LOCAL_MODE_DISABLED");

    const turnCloud = await request(app).post("/v1/agent/threads/thread-1/turns").send({
      text: "hello",
      executionMode: "cloud"
    });
    expect(turnCloud.status).toBe(503);
    expect(turnCloud.body.code).toBe("AGENT_CLOUD_MODE_DISABLED");

    const switchLocal = await request(app).patch("/v1/agent/threads/thread-1/mode").send({
      executionMode: "local"
    });
    expect(switchLocal.status).toBe(503);
    expect(switchLocal.body.code).toBe("AGENT_LOCAL_MODE_DISABLED");

    expect(createThread).not.toHaveBeenCalled();
    expect(startTurn).not.toHaveBeenCalled();
    expect(switchThreadMode).not.toHaveBeenCalled();
  });

  it("returns validation errors for malformed agent list/patch/event payloads", async () => {
    const listThreads = vi.fn();
    const updateThread = vi.fn();
    const listThreadEvents = vi.fn();
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn(async () => activeSessionRecord())
      } as unknown as AuthService,
      agentService: {
        listThreads,
        updateThread,
        listThreadEvents
      } as unknown as AgentService,
      agentGatewayEnabled: true,
      agentCloudModeEnabled: true
    });

    const invalidList = await request(app).get("/v1/agent/threads");
    expect(invalidList.status).toBe(400);
    expect(invalidList.body.code).toBe("INVALID_REQUEST");

    const invalidPatch = await request(app).patch("/v1/agent/threads/thread-1").send({});
    expect(invalidPatch.status).toBe(400);
    expect(invalidPatch.body.code).toBe("INVALID_REQUEST");

    const invalidEvents = await request(app)
      .get("/v1/agent/threads/thread-1/events")
      .query({ limit: 9999 });
    expect(invalidEvents.status).toBe(400);
    expect(invalidEvents.body.code).toBe("INVALID_REQUEST");

    expect(listThreads).not.toHaveBeenCalled();
    expect(updateThread).not.toHaveBeenCalled();
    expect(listThreadEvents).not.toHaveBeenCalled();
  });
});
