import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAuthShellData } from "~/features/auth/shell-loader";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shell loader", () => {
  it("redirects to login when auth session is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));

    const result = await loadAuthShellData({
      request: new Request("http://web.test/workspaces")
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/login?returnTo=%2Fworkspaces");
  });

  it("returns authenticated shell context", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authenticated: true,
          user: {
            id: "user_1",
            primaryEmail: "user@example.com",
            displayName: "User Example"
          },
          organizations: [
            {
              organizationId: "org_1",
              organizationSlug: "acme-org",
              organizationName: "Acme Org",
              role: "owner",
              status: "active"
            }
          ],
          workspaces: [
            {
              id: "ws_personal",
              organizationId: "org_1",
              organizationSlug: "acme-org",
              organizationName: "Acme Org",
              slug: "personal-user-1",
              name: "Personal Workspace",
              isPersonal: true,
              role: "admin",
              status: "active"
            }
          ],
          activeWorkspaceSlug: "personal-user-1",
          personalWorkspaceSlug: "personal-user-1"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const data = await loadAuthShellData({
      request: new Request("http://web.test/workspaces")
    });

    expect(data).toEqual({
      authenticated: true,
      user: {
        id: "user_1",
        primaryEmail: "user@example.com",
        displayName: "User Example"
      },
      organizations: [
        {
          organizationId: "org_1",
          organizationSlug: "acme-org",
          organizationName: "Acme Org",
          role: "owner",
          status: "active"
        }
      ],
      workspaces: [
        {
          id: "ws_personal",
          organizationId: "org_1",
          organizationSlug: "acme-org",
          organizationName: "Acme Org",
          slug: "personal-user-1",
          name: "Personal Workspace",
          isPersonal: true,
          role: "admin",
          status: "active"
        }
      ],
      activeWorkspaceSlug: "personal-user-1",
      personalWorkspaceSlug: "personal-user-1"
    });
  });

  it("redirects to login when auth context service is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    const result = await loadAuthShellData({
      request: new Request("http://web.test/workspaces")
    });

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/login?returnTo=%2Fworkspaces");
  });

  it("throws when non-401 auth context errors return without data", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 403 }));

    await expect(
      loadAuthShellData({
        request: new Request("http://web.test/workspaces")
      })
    ).rejects.toThrow("Unable to load authenticated user context.");
  });
});
