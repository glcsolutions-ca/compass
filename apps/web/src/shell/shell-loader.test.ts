import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAuthShellData } from "~/shell/shell-loader";

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
          memberships: [
            {
              tenantId: "t_1",
              tenantSlug: "acme",
              tenantName: "Acme",
              role: "owner",
              status: "active"
            }
          ],
          lastActiveTenantSlug: "acme"
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
      memberships: [
        {
          tenantId: "t_1",
          tenantSlug: "acme",
          tenantName: "Acme",
          role: "owner",
          status: "active"
        }
      ],
      lastActiveTenantSlug: "acme"
    });
  });
});
