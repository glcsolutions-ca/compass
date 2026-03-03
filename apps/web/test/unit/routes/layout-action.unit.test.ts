import { afterEach, describe, expect, it, vi } from "vitest";
import { clientAction as shellAction } from "~/routes/app/layout/route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shell layout action", () => {
  it("logs out and redirects to login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    const formData = new FormData();
    formData.set("intent", "logout");

    const response = await shellAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      })
    });

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
  });

  it("returns 400 for unsupported shell intent", async () => {
    const formData = new FormData();
    formData.set("intent", "unknown");

    const response = await shellAction({
      request: new Request("http://web.test/chat", {
        method: "POST",
        body: formData
      })
    });

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(400);
  });
});
