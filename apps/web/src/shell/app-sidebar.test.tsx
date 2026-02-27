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
  memberships: [
    {
      tenantId: "t_1",
      tenantSlug: "acme",
      tenantName: "Acme",
      role: "owner",
      status: "active"
    },
    {
      tenantId: "t_2",
      tenantSlug: "globex",
      tenantName: "Globex",
      role: "member",
      status: "active"
    }
  ],
  lastActiveTenantSlug: "globex"
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
    vi.restoreAllMocks();
  });

  it("renders primary sections and workspace rows", () => {
    render(
      <MemoryRouter initialEntries={["/workspaces"]}>
        <SidebarProvider>
          <AppSidebar
            activeTenantSlug="acme"
            auth={AUTH_FIXTURE}
            buildSettingsHref={(section) => `/t/acme/chat?modal=settings&section=${section}`}
          />
        </SidebarProvider>
      </MemoryRouter>
    );

    const newThreadLink = screen.getByRole("link", { name: "New thread" });
    const automationsLink = screen.getByRole("link", { name: "Automations" });
    const skillsLink = screen.getByRole("link", { name: "Skills" });

    expect(newThreadLink.getAttribute("href")).toContain("/t/acme/chat?thread=");
    expect(automationsLink.getAttribute("href")).toBe("/automations");
    expect(skillsLink.getAttribute("href")).toBe("/skills");

    expect(screen.getByText("Navigate")).toBeTruthy();
    expect(screen.getAllByText("Workspaces").length).toBeGreaterThan(0);
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("Globex")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeTruthy();
  });

  it("keeps utility cluster ordering in sidebar", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/workspaces"]}>
        <SidebarProvider>
          <AppSidebar
            activeTenantSlug="acme"
            auth={AUTH_FIXTURE}
            buildSettingsHref={(section) => `/t/acme/chat?modal=settings&section=${section}`}
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

  it("shows empty workspace state when user has no memberships", () => {
    render(
      <MemoryRouter initialEntries={["/workspaces"]}>
        <SidebarProvider>
          <AppSidebar
            activeTenantSlug={null}
            auth={{
              ...AUTH_FIXTURE,
              memberships: [],
              lastActiveTenantSlug: null
            }}
            buildSettingsHref={(section) => `/workspaces?modal=settings&section=${section}`}
          />
        </SidebarProvider>
      </MemoryRouter>
    );

    expect(screen.getByText("No workspaces yet.")).toBeTruthy();
  });

  it("keeps icon-mode rows accessible when sidebar is collapsed", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/t/acme/chat"]}>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar
            activeTenantSlug="acme"
            auth={AUTH_FIXTURE}
            buildSettingsHref={(section) => `/t/acme/chat?modal=settings&section=${section}`}
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
    expect(utilityNewThread.getAttribute("href")).toContain("/t/acme/chat?thread=");
    expect(scoped.getByRole("link", { name: "Automations" })).toBeTruthy();
    expect(scoped.getByRole("link", { name: "Skills" })).toBeTruthy();

    const acmeLink = scoped.getByRole("link", { name: "Acme" });
    expect(acmeLink.getAttribute("aria-label")).toBe("Acme");
    expect(acmeLink.querySelector("span[aria-hidden]")?.textContent).toBe("A");

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
                activeTenantSlug="acme"
                auth={AUTH_FIXTURE}
                buildSettingsHref={(section) => `/t/acme/chat?modal=settings&section=${section}`}
              />
            </SidebarProvider>
          )
        }
      ],
      {
        initialEntries: ["/t/acme/chat"]
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
