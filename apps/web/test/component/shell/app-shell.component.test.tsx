import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "~/components/shell/app-shell";

const useLocationMock = vi.hoisted(() => vi.fn());
const useMatchesMock = vi.hoisted(() => vi.fn());
const useNavigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useLocation: useLocationMock,
    useMatches: useMatchesMock,
    useNavigate: useNavigateMock
  };
});

vi.mock("~/components/shell/app-sidebar", () => ({
  AppSidebar: () => <aside data-testid="app-sidebar">Sidebar</aside>
}));

vi.mock("~/components/shell/settings-modal", () => ({
  SettingsModal: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSectionChange: (section: "general" | "personalization") => void;
  }) => (
    <div data-testid="settings-modal">
      <span>{props.open ? "open" : "closed"}</span>
      <button onClick={() => props.onOpenChange(true)} type="button">
        Open settings
      </button>
      <button onClick={() => props.onOpenChange(false)} type="button">
        Close settings
      </button>
      <button onClick={() => props.onSectionChange("personalization")} type="button">
        Personalization
      </button>
    </div>
  )
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
    pathname: "/w/personal-user-1/chat/thread-1",
    search: "",
    hash: ""
  });
  useMatchesMock.mockReturnValue([{ handle: { shellLayout: "default" } }]);
  useNavigateMock.mockReturnValue(vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("app shell component", () => {
  it("renders default shell layout and wires settings modal navigation", () => {
    const navigate = vi.fn();
    useNavigateMock.mockReturnValue(navigate);

    render(
      <AppShell auth={AUTH_FIXTURE}>
        <div>Child content</div>
      </AppShell>
    );

    expect(screen.getByTestId("app-sidebar")).toBeTruthy();
    expect(screen.getByText("Child content")).toBeTruthy();
    expect(screen.getByTestId("app-main").className).toContain("px-4");

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Personalization" }));

    expect(navigate).toHaveBeenCalled();
  });

  it("uses immersive shell layout when deepest route handle requests it", () => {
    useMatchesMock.mockReturnValue([
      { handle: { shellLayout: "default" } },
      { handle: { shellLayout: "immersive" } }
    ]);

    render(
      <AppShell auth={AUTH_FIXTURE}>
        <div>Immersive content</div>
      </AppShell>
    );

    const main = screen.getByTestId("app-main");
    expect(main.className).toContain("overflow-y-hidden");
  });
});
