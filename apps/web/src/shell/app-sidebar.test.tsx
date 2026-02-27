import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { AppSidebar } from "~/components/shell/app-sidebar";
import { SidebarProvider } from "~/components/ui/sidebar";
import type { AuthShellLoaderData } from "~/features/auth/types";

const AUTH_FIXTURE: AuthShellLoaderData = {
  authenticated: true,
  user: {
    id: "user_1",
    displayName: "Test User",
    primaryEmail: "user@example.com"
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
    },
    {
      id: "ws_team",
      organizationId: "org_1",
      organizationSlug: "acme-org",
      organizationName: "Acme Org",
      slug: "globex",
      name: "Globex",
      isPersonal: false,
      role: "member",
      status: "active"
    }
  ],
  activeWorkspaceSlug: "globex",
  personalWorkspaceSlug: "personal-user-1"
};

describe("app sidebar", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders utility and primary navigation sections", () => {
    render(
      <MemoryRouter initialEntries={["/workspaces"]}>
        <SidebarProvider>
          <AppSidebar
            auth={AUTH_FIXTURE}
            buildSettingsHref={(section) => `/chat?modal=settings&section=${section}`}
          />
        </SidebarProvider>
      </MemoryRouter>
    );

    const newThreadLink = screen.getByRole("link", { name: "New thread" });
    const automationsLink = screen.getByRole("link", { name: "Automations" });
    const skillsLink = screen.getByRole("link", { name: "Skills" });

    expect(newThreadLink.getAttribute("href")).toContain("/w/personal-user-1/chat?thread=");
    expect(automationsLink.getAttribute("href")).toBe("/automations");
    expect(skillsLink.getAttribute("href")).toBe("/skills");

    expect(screen.getByText("Navigate")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chat" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Workspaces" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
  });

  it("keeps utility cluster ordering in sidebar", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/workspaces"]}>
        <SidebarProvider>
          <AppSidebar
            auth={AUTH_FIXTURE}
            buildSettingsHref={(section) => `/chat?modal=settings&section=${section}`}
          />
        </SidebarProvider>
      </MemoryRouter>
    );

    const sidebar = container.querySelector('[data-sidebar="sidebar"]');
    expect(sidebar).toBeTruthy();
    const links = within(sidebar as HTMLElement).getAllByRole("link");
    const linkOrder = links.map(
      (link) => link.getAttribute("aria-label") ?? link.textContent?.replace(/\s+/gu, " ").trim()
    );

    const newThreadIndex = linkOrder.indexOf("New thread");
    const automationsIndex = linkOrder.indexOf("Automations");
    const skillsIndex = linkOrder.indexOf("Skills");

    expect(newThreadIndex).toBeGreaterThanOrEqual(0);
    expect(automationsIndex).toBeGreaterThan(newThreadIndex);
    expect(skillsIndex).toBeGreaterThan(automationsIndex);
  });

  it("does not render workspace rows when user has no active workspaces", () => {
    render(
      <MemoryRouter initialEntries={["/workspaces"]}>
        <SidebarProvider>
          <AppSidebar
            auth={{
              ...AUTH_FIXTURE,
              workspaces: [],
              activeWorkspaceSlug: null,
              personalWorkspaceSlug: null
            }}
            buildSettingsHref={(section) => `/workspaces?modal=settings&section=${section}`}
          />
        </SidebarProvider>
      </MemoryRouter>
    );

    expect(screen.queryByText("No workspaces yet.")).toBeNull();
    expect(screen.getByRole("link", { name: "Workspaces" })).toBeTruthy();
  });

  it("keeps icon-mode rows accessible when sidebar is collapsed", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/chat"]}>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar
            auth={AUTH_FIXTURE}
            buildSettingsHref={(section) => `/chat?modal=settings&section=${section}`}
          />
        </SidebarProvider>
      </MemoryRouter>
    );

    const sidebar = container.querySelector('[data-sidebar="sidebar"]');
    expect(sidebar).toBeTruthy();
    const scoped = within(sidebar as HTMLElement);

    const chatLink = scoped.getByRole("link", { name: "Chat" });
    expect(chatLink.getAttribute("aria-label")).toBe("Chat");

    const utilityNewThread = scoped.getByRole("link", { name: "New thread" });
    expect(utilityNewThread.getAttribute("href")).toContain("/w/personal-user-1/chat?thread=");
    expect(scoped.getByRole("link", { name: "Automations" })).toBeTruthy();
    expect(scoped.getByRole("link", { name: "Skills" })).toBeTruthy();

    const expandButton = scoped.getByRole("button", { name: "Expand sidebar" });
    expect(expandButton).toBeTruthy();
    expect(scoped.queryByRole("link", { name: "Compass" })).toBeNull();
  });

  it("renders settings and personalization entries with URL-backed modal links", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <SidebarProvider>
              <AppSidebar
                auth={AUTH_FIXTURE}
                buildSettingsHref={(section) => `/chat?modal=settings&section=${section}`}
              />
            </SidebarProvider>
          )
        }
      ],
      {
        initialEntries: ["/chat"]
      }
    );

    render(<RouterProvider router={router} />);

    const accountTrigger = screen.getAllByRole("button", { name: "Open account menu" })[0];
    fireEvent.pointerDown(accountTrigger as HTMLElement);
    fireEvent.click(accountTrigger as HTMLElement);

    const settingsItem = await screen.findByRole("menuitem", { name: "Settings" });
    const personalizationItem = await screen.findByRole("menuitem", { name: "Personalization" });
    const menuItemLabels = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent?.replace(/\s+/gu, " ").trim());

    const settingsHref =
      settingsItem.getAttribute("href") ??
      settingsItem.querySelector("a")?.getAttribute("href") ??
      "";
    const personalizationHref =
      personalizationItem.getAttribute("href") ??
      personalizationItem.querySelector("a")?.getAttribute("href") ??
      "";

    expect(settingsHref).toContain("modal=settings&section=general");
    expect(personalizationHref).toContain("modal=settings&section=personalization");
    expect(menuItemLabels).toEqual(["Personalization", "Settings", "Help", "Log out"]);
    expect(screen.queryByRole("menuitem", { name: "Manage workspaces" })).toBeNull();
    expect(screen.queryByText("No workspaces found.")).toBeNull();
  });
});
