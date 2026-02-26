import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import LoginRoute, { resolveReturnTo } from "../../app/routes/login.js";
import { clientLoader as workspacesLoader } from "../../app/routes/workspaces.js";
import { clientLoader as tenantLoader } from "../../app/routes/tenant.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("login route", () => {
  it("normalizes returnTo values", () => {
    expect(resolveReturnTo(null)).toBe("/");
    expect(resolveReturnTo("  /t/acme/projects/123 ")).toBe("/t/acme/projects/123");
    expect(resolveReturnTo("https://evil.test")).toBe("/");
    expect(resolveReturnTo("//evil.test")).toBe("/");
  });

  it("renders sign in link", () => {
    render(
      <MemoryRouter initialEntries={["/login?returnTo=%2Ft%2Facme"]}>
        <LoginRoute />
      </MemoryRouter>
    );

    const link = screen.getByTestId("sign-in-link");
    expect(link.getAttribute("href")).toBe("/v1/auth/entra/start?returnTo=%2Ft%2Facme");
  });

  it("renders admin consent guidance for consent-required errors", () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/login?error=admin_consent_required&returnTo=%2Ft%2Facme&tenantHint=contoso.onmicrosoft.com"
        ]}
      >
        <LoginRoute />
      </MemoryRouter>
    );

    expect(screen.getByTestId("admin-consent-notice")).toBeTruthy();
    const link = screen.getByTestId("admin-consent-link");
    expect(link.getAttribute("href")).toBe(
      "/v1/auth/entra/admin-consent/start?returnTo=%2Ft%2Facme&tenantHint=contoso.onmicrosoft.com"
    );
  });
});

describe("workspaces loader", () => {
  it("returns unauthenticated on 401", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const data = await workspacesLoader({
      request: new Request("http://web.test/workspaces")
    });

    expect(data).toEqual({
      authenticated: false,
      memberships: [],
      error: null
    });
  });

  it("parses memberships on success", async () => {
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

    const data = await workspacesLoader({
      request: new Request("http://web.test/workspaces")
    });

    expect(data).toEqual({
      authenticated: true,
      memberships: [
        {
          tenantId: "t_1",
          tenantSlug: "acme",
          tenantName: "Acme",
          role: "owner",
          status: "active"
        }
      ],
      error: null
    });
  });
});

describe("tenant loader", () => {
  it("redirects to login when unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const result = await tenantLoader({
      params: { tenantSlug: "acme" },
      request: new Request("http://web.test/t/acme/projects/123")
    });

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login?returnTo=%2Ft%2Facme%2Fprojects%2F123");
  });

  it("returns tenant details when authorized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant: {
            id: "t_1",
            slug: "acme",
            name: "Acme Corp"
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const data = await tenantLoader({
      params: { tenantSlug: "acme" },
      request: new Request("http://web.test/t/acme")
    });

    expect(data).toEqual({
      tenantSlug: "acme",
      tenantName: "Acme Corp"
    });
  });

  it("redirects to workspaces when membership is forbidden", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));

    const result = await tenantLoader({
      params: { tenantSlug: "acme" },
      request: new Request("http://web.test/t/acme")
    });

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces?error=forbidden");
  });
});
