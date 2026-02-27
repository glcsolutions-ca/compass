import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { buildApiApp } from "./app.js";
import { ApiError } from "./auth-service.js";
import type { AuthService } from "./auth-service.js";
import type { AgentService } from "./agent-service.js";

describe("API app", () => {
  it("returns health status", async () => {
    const app = buildApiApp({
      now: () => new Date("2026-02-25T00:00:00.000Z")
    });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      timestamp: "2026-02-25T00:00:00.000Z"
    });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("serves openapi document", async () => {
    const app = buildApiApp();

    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths["/health"]).toBeTruthy();
    expect(response.body.paths["/v1/ping"]).toBeTruthy();
  });

  it("returns v1 ping", async () => {
    const app = buildApiApp();

    const response = await request(app).get("/v1/ping");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, service: "api" });
  });

  it("returns JSON for unknown routes", async () => {
    const app = buildApiApp();

    const response = await request(app).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "NOT_FOUND",
      message: "Route not found"
    });
  });

  it("returns JSON error for malformed request bodies", async () => {
    const app = buildApiApp();

    const response = await request(app)
      .post("/v1/ping")
      .set("content-type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: "INVALID_JSON",
      message: "Malformed JSON request body"
    });
  });

  it("rate limits Entra start endpoint by client IP", async () => {
    const authService = {
      startEntraLogin: vi.fn(async () => ({
        redirectUrl: "https://login.microsoftonline.com/test"
      }))
    } as unknown as AuthService;

    const app = buildApiApp({
      authService,
      authRateLimitWindowMs: 60_000,
      authRateLimitMaxRequests: 1
    });

    const first = await request(app)
      .get("/v1/auth/entra/start")
      .set("x-forwarded-for", "203.0.113.1");
    expect(first.status).toBe(302);

    const second = await request(app)
      .get("/v1/auth/entra/start")
      .set("x-forwarded-for", "203.0.113.1");
    expect(second.status).toBe(429);
    expect(second.body).toEqual({
      code: "RATE_LIMITED",
      message: "Too many authentication requests"
    });
  });

  it("sets session cookie when Entra start returns a session token", async () => {
    const authService = {
      startEntraLogin: vi.fn(async () => ({
        redirectUrl: "/chat",
        sessionToken: "mock-session-token"
      })),
      createSessionCookie: vi.fn(
        () =>
          "__Host-compass_session=mock-session-token; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800"
      )
    } as unknown as AuthService;

    const app = buildApiApp({ authService });
    const response = await request(app).get("/v1/auth/entra/start");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/chat");
    expect(response.headers["set-cookie"]?.[0]).toContain("__Host-compass_session=");
  });

  it("redirects to login when desktop handoff token is invalid", async () => {
    const authService = {
      completeDesktopLogin: vi.fn(async () => {
        throw new ApiError(401, "DESKTOP_HANDOFF_INVALID", "Desktop auth handoff is invalid");
      })
    } as unknown as AuthService;

    const app = buildApiApp({ authService });
    const response = await request(app).get("/v1/auth/desktop/complete?handoff=expired");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("/login?error=desktop_handoff_invalid");
  });

  it("blocks cross-origin state-changing requests when session cookie is present", async () => {
    const authService = {
      logout: vi.fn(async () => {}),
      clearSessionCookie: vi.fn(() => "__Host-compass_session=; Path=/; Max-Age=0")
    } as unknown as AuthService;

    const app = buildApiApp({
      authService,
      allowedOrigins: ["https://compass.glcsolutions.ca"]
    });

    const response = await request(app)
      .post("/v1/auth/logout")
      .set("cookie", "__Host-compass_session=test")
      .set("origin", "https://evil.example");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: "CSRF_ORIGIN_DENIED",
      message: "Cross-origin state-changing requests are not allowed"
    });
  });

  it("requires origin header for state-changing requests with session cookie", async () => {
    const authService = {
      logout: vi.fn(async () => {}),
      clearSessionCookie: vi.fn(() => "__Host-compass_session=; Path=/; Max-Age=0")
    } as unknown as AuthService;

    const app = buildApiApp({
      authService,
      allowedOrigins: ["https://compass.glcsolutions.ca"]
    });

    const response = await request(app)
      .post("/v1/auth/logout")
      .set("cookie", "__Host-compass_session=test");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      code: "CSRF_ORIGIN_REQUIRED",
      message: "Origin header is required for state-changing requests"
    });
  });

  it("redacts unexpected auth handler errors and emits structured logs with request id", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const authService = {
      readAuthMe: vi.fn(async () => {
        throw new Error("sensitive database detail");
      })
    } as unknown as AuthService;

    const app = buildApiApp({ authService });

    const response = await request(app).get("/v1/auth/me").set("x-request-id", "req-123");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error"
    });
    expect(response.headers["x-request-id"]).toBe("req-123");
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(String(consoleErrorSpy.mock.calls[0]?.[0] ?? "")).toContain(
      '"event":"api.auth.unhandled_error"'
    );
    expect(String(consoleErrorSpy.mock.calls[0]?.[0] ?? "")).toContain('"requestId":"req-123"');
    consoleErrorSpy.mockRestore();
  });

  it("caps auth rate limiter key cardinality to avoid unbounded growth", async () => {
    const authService = {
      startEntraLogin: vi.fn(async () => ({
        redirectUrl: "https://login.microsoftonline.com/test"
      }))
    } as unknown as AuthService;

    const app = buildApiApp({
      authService,
      authRateLimitWindowMs: 60_000,
      authRateLimitMaxRequests: 1,
      authRateLimitMaxEntries: 2
    });

    const firstIpFirst = await request(app)
      .get("/v1/auth/entra/start")
      .set("x-forwarded-for", "203.0.113.1");
    expect(firstIpFirst.status).toBe(302);

    const secondIpFirst = await request(app)
      .get("/v1/auth/entra/start")
      .set("x-forwarded-for", "203.0.113.2");
    expect(secondIpFirst.status).toBe(302);

    const thirdIpFirst = await request(app)
      .get("/v1/auth/entra/start")
      .set("x-forwarded-for", "203.0.113.3");
    expect(thirdIpFirst.status).toBe(302);

    const firstIpSecond = await request(app)
      .get("/v1/auth/entra/start")
      .set("x-forwarded-for", "203.0.113.1");
    expect(firstIpSecond.status).toBe(302);
  });

  it("returns disabled error for agent routes when feature flag is off", async () => {
    const app = buildApiApp({
      authService: {
        readAuthMe: vi.fn()
      } as unknown as AuthService,
      agentService: {
        createThread: vi.fn()
      } as unknown as AgentService,
      agentGatewayEnabled: false
    });

    const response = await request(app)
      .post("/v1/agent/threads")
      .send({ tenantSlug: "acme", executionMode: "cloud" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: "AGENT_GATEWAY_DISABLED",
      message: "Agent gateway is disabled"
    });
  });

  it("creates an agent thread when authenticated", async () => {
    const authService = {
      readAuthMe: vi.fn(async () => ({
        authenticated: true,
        user: { id: "usr-1" }
      }))
    } as unknown as AuthService;

    const createThread = vi.fn(async () => {
      return {
        threadId: "thread-1",
        tenantId: "tenant-1",
        tenantSlug: "acme",
        executionMode: "cloud",
        executionHost: "dynamic_sessions",
        status: "idle",
        cloudSessionIdentifier: "thr-thread-1",
        title: null,
        createdAt: "2026-02-27T00:00:00.000Z",
        updatedAt: "2026-02-27T00:00:00.000Z",
        modeSwitchedAt: null
      };
    });
    const agentService = {
      createThread
    } as unknown as AgentService;

    const app = buildApiApp({
      authService,
      agentService,
      agentGatewayEnabled: true,
      agentCloudModeEnabled: true
    });

    const response = await request(app).post("/v1/agent/threads").send({
      tenantSlug: "acme",
      executionMode: "cloud"
    });

    expect(response.status).toBe(201);
    expect(response.body.thread.threadId).toBe("thread-1");
    expect(createThread).toHaveBeenCalledTimes(1);
  });

  it("returns upgrade required on HTTP access to agent stream route", async () => {
    const app = buildApiApp();

    const response = await request(app).get("/v1/agent/threads/thread-1/stream");

    expect(response.status).toBe(426);
    expect(response.body).toEqual({
      code: "UPGRADE_REQUIRED",
      message: "Use websocket upgrade for this endpoint"
    });
  });

  it("blocks mode switching when AGENT_MODE_SWITCH_ENABLED is false", async () => {
    const authService = {
      readAuthMe: vi.fn(async () => ({
        authenticated: true,
        user: { id: "usr-1" }
      }))
    } as unknown as AuthService;

    const app = buildApiApp({
      authService,
      agentService: {
        switchThreadMode: vi.fn()
      } as unknown as AgentService,
      agentGatewayEnabled: true,
      agentModeSwitchEnabled: false
    });

    const response = await request(app)
      .patch("/v1/agent/threads/thread-1/mode")
      .send({ executionMode: "local" });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: "AGENT_MODE_SWITCH_DISABLED",
      message: "Mode switching is disabled"
    });
  });
});
