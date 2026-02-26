import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLoginRouteData } from "~/routes/public.login/loader";
import { loadWorkspacesData } from "~/routes/app.workspaces/loader";
import { loadTenantChatData } from "~/routes/app.t.$tenantSlug.chat/loader";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("frontend route loaders", () => {
  it("builds login route links when unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const data = await loadLoginRouteData({
      request: new Request("http://web.test/login?returnTo=%2Ft%2Facme%2Fchat")
    });

    expect(data.signInHref).toBe("/v1/auth/entra/start?returnTo=%2Ft%2Facme%2Fchat");
    expect(data.showAdminConsentNotice).toBe(false);
    expect(data.showAdminConsentSuccess).toBe(false);
  });

  it("redirects login route to tenant chat when already authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          memberships: [{ tenantSlug: "acme" }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const response = await loadLoginRouteData({
      request: new Request("http://web.test/login")
    });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/t/acme/chat");
  });

  it("reads workspaces error from query", async () => {
    const data = await loadWorkspacesData({
      request: new Request("http://web.test/workspaces?error=forbidden")
    });

    expect(data).toEqual({
      error: "forbidden"
    });
  });

  it("redirects tenant chat loader to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const response = await loadTenantChatData({
      request: new Request("http://web.test/t/acme/chat"),
      params: { tenantSlug: "acme" }
    });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe(
      "/login?returnTo=%2Ft%2Facme%2Fchat"
    );
  });
});
