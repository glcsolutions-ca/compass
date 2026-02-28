import { describe, expect, it } from "vitest";
import { ApiErrorSchema } from "./schemas.js";
import {
  AgentThreadListQuerySchema,
  AgentThreadPatchRequestSchema,
  AgentStreamEventSchema,
  AgentThreadCreateRequestSchema,
  AgentTurnStartRequestSchema,
  RuntimeAccountLoginStartRequestSchema,
  RuntimeAccountLoginStartResponseSchema,
  RuntimeAccountRateLimitsReadResponseSchema,
  RuntimeAccountReadResponseSchema,
  RuntimeNotificationSchema
} from "./agent-gateway.js";

describe("agent gateway contract schemas", () => {
  it("accepts valid request payloads", () => {
    expect(
      AgentThreadCreateRequestSchema.parse({
        workspaceSlug: "personal-jkropp",
        executionMode: "cloud",
        title: "My first thread"
      }).workspaceSlug
    ).toBe("personal-jkropp");

    expect(
      AgentTurnStartRequestSchema.parse({
        text: "hello",
        executionMode: "cloud"
      }).text
    ).toBe("hello");

    expect(
      AgentThreadListQuerySchema.parse({
        workspaceSlug: "personal-jkropp",
        state: "all",
        limit: 25
      }).state
    ).toBe("all");

    expect(
      AgentThreadPatchRequestSchema.parse({
        title: "Renamed thread",
        archived: true
      }).archived
    ).toBe(true);

    expect(
      RuntimeAccountLoginStartRequestSchema.parse({
        type: "chatgptAuthTokens",
        accessToken: "access_token",
        chatgptAccountId: "org_123"
      }).type
    ).toBe("chatgptAuthTokens");
  });

  it("accepts valid runtime account and rate-limit payloads", () => {
    expect(
      RuntimeAccountReadResponseSchema.parse({
        provider: "local_process",
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
        account: {
          type: "chatgpt",
          email: "user@example.com"
        }
      }).authMode
    ).toBe("chatgpt");

    expect(
      RuntimeAccountRateLimitsReadResponseSchema.parse({
        rateLimits: {
          limitId: "codex",
          limitName: "Codex",
          primary: {
            usedPercent: 42,
            windowDurationMins: 15,
            resetsAt: 1_730_947_200
          },
          secondary: null
        },
        rateLimitsByLimitId: null
      }).rateLimits?.primary?.usedPercent
    ).toBe(42);
  });

  it("accepts valid runtime notifications and stream events", () => {
    expect(
      RuntimeNotificationSchema.parse({
        cursor: 10,
        method: "account/updated",
        params: { authMode: "apikey" },
        createdAt: new Date().toISOString()
      }).method
    ).toBe("account/updated");

    expect(
      AgentStreamEventSchema.parse({
        type: "approval.requested",
        method: "item/commandExecution/requestApproval",
        requestId: "approval_1",
        payload: {
          threadId: "thr_1"
        }
      }).type
    ).toBe("approval.requested");
  });

  it("rejects malformed runtime/auth payloads", () => {
    expect(
      RuntimeAccountLoginStartRequestSchema.safeParse({
        type: "apiKey",
        apiKey: ""
      }).success
    ).toBe(false);

    expect(
      RuntimeAccountLoginStartResponseSchema.safeParse({
        type: "unknown"
      }).success
    ).toBe(false);

    expect(
      RuntimeNotificationSchema.safeParse({
        method: "unknown",
        createdAt: new Date().toISOString()
      }).success
    ).toBe(false);

    expect(AgentThreadPatchRequestSchema.safeParse({}).success).toBe(false);
  });

  it("keeps shared API error shape stable", () => {
    const parsed = ApiErrorSchema.parse({
      code: "INTERNAL_ERROR",
      message: "Unexpected failure"
    });

    expect(parsed.code).toBe("INTERNAL_ERROR");
    expect(ApiErrorSchema.safeParse({ code: "ERR" }).success).toBe(false);
  });
});
