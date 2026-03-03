import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApiApp } from "./app.js";
import { ApiError } from "./auth-service.js";
import type { AuthService } from "./auth-service.js";
import type { AgentService } from "./agent-service.js";

function activeSessionRecord() {
  return {
    authenticated: true,
    user: { id: "usr-1" }
  };
}

describe("API app additional route coverage", () => {
  it("starts admin consent and redirects", async () => {
    const app = buildApiApp({
      authService: {
        startAdminConsent: vi.fn(async () => ({
          redirectUrl: "https://login.microsoftonline.com/adminconsent"
        }))
      } as unknown as AuthService
    });

    const response = await request(app).get("/v1/auth/entra/admin-consent/start");
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("adminconsent");
  });

  it("handles entra callback success and sets session cookie", async () => {
    const app = buildApiApp({
      authService: {
        handleEntraCallback: vi.fn(async () => ({
          redirectTo: "/chat",
          sessionToken: "session-1"
        })),
        createSessionCookie: vi.fn(() => "__Host-compass_session=session-1; Path=/; HttpOnly")
      } as unknown as AuthService
    });

    const response = await request(app).get("/v1/auth/entra/callback?state=s1&code=c1");
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/chat");
    expect(response.headers["set-cookie"]?.[0]).toContain("__Host-compass_session");
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
          cloudSessionIdentifier: "thr-thread-1",
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
});
