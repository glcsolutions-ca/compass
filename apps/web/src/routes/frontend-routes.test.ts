import { afterEach, describe, expect, it, vi } from "vitest";
import { clientLoader as rootRedirectLoader } from "~/routes/root-redirect/route";
import { clientLoader as loginLoader } from "~/routes/public/login/route";
import { clientLoader as workspacesLoader } from "~/routes/app/workspaces/route";
import { clientLoader as chatLoader, handle as chatHandle } from "~/routes/app/chat/route";
import {
  handle as automationsHandle,
  meta as automationsMeta
} from "~/routes/app/automations/route";
import { handle as skillsHandle, meta as skillsMeta } from "~/routes/app/skills/route";

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

  it("redirects root route to chat when authenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          memberships: [
            {
              tenantId: "t_personal",
              tenantSlug: "personal-user-1",
              tenantName: "Personal Workspace",
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

    const response = await rootRedirectLoader({
      request: new Request("http://web.test/")
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected redirect response");
    }
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/chat");
  });

  it("builds login route links when unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const data = await loginLoader({
      request: new Request("http://web.test/login?returnTo=%2Fchat")
    });

    expect(data).toEqual({
      signInHref: "/v1/auth/entra/start?returnTo=%2Fchat",
      adminConsentHref: "/v1/auth/entra/admin-consent/start?returnTo=%2Fchat",
      showAdminConsentNotice: false,
      showAdminConsentSuccess: false
    });
  });

  it("redirects login route to chat when already authenticated", async () => {
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
    expect((response as Response).headers.get("Location")).toBe("/chat");
  });

  it("reads workspaces error from query", async () => {
    const data = await workspacesLoader({
      request: new Request("http://web.test/workspaces?error=forbidden")
    });

    expect(data).toEqual({
      error: "forbidden",
      notice: null,
      workspaceSlug: null
    });
  });

  it("redirects chat loader to login on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const response = await chatLoader({
      request: new Request("http://web.test/chat"),
      params: {}
    });

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/login?returnTo=%2Fchat");
  });

  it("defines authenticated placeholder handles for utility routes", () => {
    expect(automationsHandle).toMatchObject({
      requiresAuth: true,
      navLabel: "Automations"
    });
    expect(skillsHandle).toMatchObject({
      requiresAuth: true,
      navLabel: "Skills"
    });
  });

  it("uses immersive chat shell layout for chat route", () => {
    expect(chatHandle).toMatchObject({
      requiresAuth: true,
      navLabel: "Chat",
      shellLayout: "immersive"
    });
  });

  it("defines metadata for utility placeholder routes", () => {
    expect(automationsMeta({} as never)).toEqual([{ title: "Compass Automations" }]);
    expect(skillsMeta({} as never)).toEqual([{ title: "Compass Skills" }]);
  });
});
