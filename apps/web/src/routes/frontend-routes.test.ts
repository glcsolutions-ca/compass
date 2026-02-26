import { afterEach, describe, expect, it, vi } from "vitest";
import { clientLoader as rootRedirectLoader } from "~/routes/root-redirect/route";
import { clientLoader as loginLoader } from "~/routes/public/login/route";
import { clientLoader as workspacesLoader } from "~/routes/app/workspaces/route";
import { clientLoader as chatLoader } from "~/routes/app/chat/route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("frontend route loaders", () => {
  it("redirects root route to login when unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const response = await rootRedirectLoader({
      request: new Request("http://web.test/")
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected redirect response");
    }
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
  });

  it("redirects root route to workspaces when authenticated without memberships", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          memberships: []
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const response = await rootRedirectLoader({
      request: new Request("http://web.test/")
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected redirect response");
    }
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces");
  });

  it("builds login route links when unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const data = await loginLoader({
      request: new Request("http://web.test/login?returnTo=%2Ft%2Facme%2Fchat")
    });

    expect(data).toEqual({
      signInHref: "/v1/auth/entra/start?returnTo=%2Ft%2Facme%2Fchat",
      adminConsentHref: "/v1/auth/entra/admin-consent/start?returnTo=%2Ft%2Facme%2Fchat",
      showAdminConsentNotice: false,
      showAdminConsentSuccess: false
    });
  });

  it("redirects login route to tenant chat when already authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          memberships: [
            {
              tenantId: "t_1",
              tenantSlug: "acme",
              tenantName: "Acme",
              role: "owner",
              status: "active"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const response = await loginLoader({
      request: new Request("http://web.test/login")
    });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/t/acme/chat");
  });

  it("reads workspaces error from query", async () => {
    const data = await workspacesLoader({
      request: new Request("http://web.test/workspaces?error=forbidden")
    });

    expect(data).toEqual({
      error: "forbidden"
    });
  });

  it("redirects tenant chat loader to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const response = await chatLoader({
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
