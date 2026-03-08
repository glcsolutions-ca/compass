import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "~/layout/app-layout";
import type { AppSidebarProps } from "~/layout/app-sidebar";

const useLocationMock = vi.hoisted(() => vi.fn());
const useMatchesMock = vi.hoisted(() => vi.fn());
const appSidebarMock = vi.hoisted(() =>
  vi.fn(() => <aside data-testid="app-sidebar">Sidebar</aside>)
);

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useLocation: useLocationMock,
    useMatches: useMatchesMock
  };
});

vi.mock("~/layout/app-sidebar", () => ({
  AppSidebar: appSidebarMock
}));

const AUTH_FIXTURE = {
  authenticated: true,
  user: {
    id: "user_1",
    displayName: "Test User",
    primaryEmail: "user@example.com"
  },
  organizations: [],
  workspaces: [],
  activeWorkspaceSlug: "personal-user-1",
  personalWorkspaceSlug: "personal-user-1"
};

beforeEach(() => {
  vi.resetAllMocks();
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
  useLocationMock.mockReturnValue({
    pathname: "/chat",
    search: "?workspace=personal-user-1",
    hash: ""
  });
  useMatchesMock.mockReturnValue([{ handle: { shellLayout: "default" } }]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("app layout component", () => {
  it("renders default shell layout and passes workspace settings links to the sidebar", () => {
    render(
      <AppLayout auth={AUTH_FIXTURE}>
        <div>Child content</div>
      </AppLayout>
    );

    expect(screen.getByTestId("app-sidebar")).toBeTruthy();
    expect(screen.getByText("Child content")).toBeTruthy();
    expect(screen.getByTestId("app-main").className).toContain("px-4");
    expect(screen.getByRole("button", { name: "Open navigation" })).toBeTruthy();

    const sidebarProps = appSidebarMock.mock.calls[0]?.[0] as AppSidebarProps | undefined;
    expect(sidebarProps).toBeTruthy();
    if (!sidebarProps) {
      throw new Error("Expected AppLayout to render AppSidebar with props.");
    }
    expect(sidebarProps.buildSettingsHref("general")).toBe(
      "/w/personal-user-1/settings?section=general"
    );
    expect(sidebarProps.buildSettingsHref("personalization")).toBe(
      "/w/personal-user-1/settings?section=personalization"
    );
  });

  it("uses immersive shell layout when deepest route handle requests it", () => {
    useMatchesMock.mockReturnValue([
      { handle: { shellLayout: "default" } },
      { handle: { shellLayout: "immersive" } }
    ]);

    render(
      <AppLayout auth={AUTH_FIXTURE}>
        <div>Immersive content</div>
      </AppLayout>
    );

    const main = screen.getByTestId("app-main");
    expect(main.className).toContain("overflow-y-hidden");
  });
});
