import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./openapi.js";

describe("buildOpenApiDocument", () => {
  it("exposes baseline system and auth paths with operation ids", () => {
    const document = buildOpenApiDocument() as {
      openapi?: string;
      paths?: Record<string, { get?: { operationId?: string }; post?: { operationId?: string } }>;
      components?: {
        securitySchemes?: Record<string, unknown>;
      };
    };

    expect(document.openapi).toBe("3.1.0");
    expect(document.paths?.["/health"]).toBeTruthy();
    expect(document.paths?.["/v1/ping"]).toBeTruthy();
    expect(document.paths?.["/v1/auth/entra/start"]).toBeTruthy();
    expect(document.paths?.["/v1/auth/entra/callback"]).toBeTruthy();
    expect(document.paths?.["/v1/auth/me"]).toBeTruthy();
    expect(document.paths?.["/v1/auth/logout"]).toBeTruthy();
    expect(document.paths?.["/v1/tenants"]).toBeTruthy();
    expect(document.paths?.["/v1/tenants/{tenantSlug}"]).toBeTruthy();
    expect(document.paths?.["/v1/tenants/{tenantSlug}/members"]).toBeTruthy();
    expect(document.paths?.["/v1/tenants/{tenantSlug}/invites"]).toBeTruthy();
    expect(document.paths?.["/v1/tenants/{tenantSlug}/invites/{token}/accept"]).toBeTruthy();
    expect(document.paths?.["/v1/agent/threads"]).toBeTruthy();
    expect(document.paths?.["/v1/agent/threads/{threadId}"]).toBeTruthy();
    expect(document.paths?.["/v1/agent/threads/{threadId}/mode"]).toBeTruthy();
    expect(document.paths?.["/v1/agent/threads/{threadId}/turns"]).toBeTruthy();
    expect(document.paths?.["/v1/agent/threads/{threadId}/turns/{turnId}/interrupt"]).toBeTruthy();
    expect(document.paths?.["/v1/agent/threads/{threadId}/events:batch"]).toBeTruthy();
    expect(document.paths?.["/v1/agent/threads/{threadId}/events"]).toBeTruthy();
    expect(document.paths?.["/v1/agent/threads/{threadId}/stream"]).toBeTruthy();
    expect(document.paths?.["/health"]?.get?.operationId).toBe("getHealth");
    expect(document.paths?.["/v1/ping"]?.get?.operationId).toBe("getPing");
    expect(document.paths?.["/v1/auth/entra/start"]?.get?.operationId).toBe("startEntraLogin");
    expect(document.paths?.["/v1/auth/entra/callback"]?.get?.operationId).toBe(
      "handleEntraCallback"
    );
    expect(document.paths?.["/v1/auth/me"]?.get?.operationId).toBe("getAuthMe");
    expect(document.paths?.["/v1/auth/logout"]?.post?.operationId).toBe("logout");
    expect(document.paths?.["/v1/tenants"]?.post?.operationId).toBe("createTenant");
    expect(document.paths?.["/v1/tenants/{tenantSlug}"]?.get?.operationId).toBe("getTenant");
    expect(document.paths?.["/v1/tenants/{tenantSlug}/members"]?.get?.operationId).toBe(
      "listTenantMembers"
    );
    expect(document.paths?.["/v1/tenants/{tenantSlug}/invites"]?.post?.operationId).toBe(
      "createTenantInvite"
    );
    expect(
      document.paths?.["/v1/tenants/{tenantSlug}/invites/{token}/accept"]?.post?.operationId
    ).toBe("acceptTenantInvite");
    expect(document.paths?.["/v1/agent/threads"]?.post?.operationId).toBe("createAgentThread");
    expect(document.paths?.["/v1/agent/threads/{threadId}"]?.get?.operationId).toBe(
      "getAgentThread"
    );
    expect(document.components?.securitySchemes?.sessionCookieAuth).toBeTruthy();

    const callbackParameters = (
      document.paths?.["/v1/auth/entra/callback"] as {
        get?: { parameters?: Array<{ name?: string }> };
      }
    )?.get?.parameters;
    const callbackParameterNames = callbackParameters?.map((parameter) => parameter.name) ?? [];
    expect(callbackParameterNames).toEqual(
      expect.arrayContaining(["code", "state", "admin_consent", "tenant", "scope", "error"])
    );

    const inviteAcceptResponses = (
      document.paths?.["/v1/tenants/{tenantSlug}/invites/{token}/accept"] as {
        post?: { responses?: Record<string, unknown> };
      }
    )?.post?.responses;
    expect(inviteAcceptResponses?.["409"]).toBeTruthy();
  });
});
