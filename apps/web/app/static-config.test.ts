import { describe, expect, it, vi } from "vitest";
import tailwindConfig from "../tailwind.config";
import routeConfig from "./routes";
import App, { Layout } from "./root";
import ChatRedirectRoute, {
  clientLoader as chatRedirectLoader
} from "./routes/app/chat-redirect/route";
import { loadAuthShellData } from "~/features/auth/shell-loader";

vi.mock("~/features/auth/shell-loader", () => ({
  loadAuthShellData: vi.fn()
}));

describe("static route/config modules", () => {
  it("exports expected tailwind and route configuration", () => {
    expect(tailwindConfig.darkMode).toEqual(["class"]);
    expect(tailwindConfig.plugins).toHaveLength(1);
    expect(routeConfig).toHaveLength(4);
  });

  it("creates root layout and app route elements", () => {
    const layoutElement = Layout({
      children: "child"
    });
    const appElement = App();

    expect(layoutElement).toBeTruthy();
    expect(appElement).toBeTruthy();
    expect(ChatRedirectRoute()).toBeNull();
  });

  it("redirects chat root to a resolved workspace", async () => {
    vi.mocked(loadAuthShellData).mockResolvedValue({
      authenticated: true,
      user: {
        id: "user_1",
        primaryEmail: "user@example.com",
        displayName: "User"
      },
      organizations: [],
      workspaces: [
        {
          id: "ws_1",
          organizationId: "org_1",
          organizationSlug: "org",
          organizationName: "Org",
          slug: "workspace-main",
          name: "Workspace Main",
          isPersonal: true,
          role: "admin",
          status: "active"
        }
      ],
      activeWorkspaceSlug: null,
      personalWorkspaceSlug: "workspace-main"
    });

    const response = await chatRedirectLoader({
      request: new Request("http://web.test/chat")
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/chat");
  });

  it("redirects to /workspaces when no workspace slug can be resolved", async () => {
    vi.mocked(loadAuthShellData).mockResolvedValue({
      authenticated: true,
      user: {
        id: "user_1",
        primaryEmail: "user@example.com",
        displayName: "User"
      },
      organizations: [],
      workspaces: [],
      activeWorkspaceSlug: null,
      personalWorkspaceSlug: null
    });

    const response = await chatRedirectLoader({
      request: new Request("http://web.test/chat")
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/workspaces");
  });
});
