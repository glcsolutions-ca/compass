import { afterEach, describe, expect, it, vi } from "vitest";
import { clientAction as workspacesAction } from "~/routes/app/workspaces/route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workspaces action", () => {
  it("logs out and redirects to login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const formData = new FormData();
    formData.set("intent", "logout");

    const response = (await workspacesAction({
      request: new Request("http://web.test/workspaces", {
        method: "POST",
        body: formData
      })
    })) as Response;

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
  });

  it("validates create payload", async () => {
    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("slug", "");
    formData.set("name", "Acme");

    const result = await workspacesAction({
      request: new Request("http://web.test/workspaces", {
        method: "POST",
        body: formData
      })
    });

    expect(result).toEqual({
      intent: "create",
      error: "Organization slug is required."
    });
  });

  it("redirects back to workspaces with success state after workspace creation", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tenant: {
            slug: "acme"
          }
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" }
        }
      )
    );

    const formData = new FormData();
    formData.set("intent", "create");
    formData.set("slug", "acme");
    formData.set("name", "Acme Corp");

    const response = (await workspacesAction({
      request: new Request("http://web.test/workspaces", {
        method: "POST",
        body: formData
      })
    })) as Response;

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces?notice=created&workspace=acme");
  });
});
