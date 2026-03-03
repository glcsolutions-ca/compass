import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type * as ReactRouter from "react-router";
import { AppSidebar } from "~/components/shell/app-sidebar";
import { SidebarProvider } from "~/components/ui/sidebar";
import type { AuthShellLoaderData } from "~/features/auth/types";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof ReactRouter>("react-router");

  return {
    ...actual,
    Form: ({ children, ...props }: Record<string, unknown>) => <form {...props}>{children}</form>
  };
});

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
    }
  ],
  activeWorkspaceSlug: "personal-user-1",
  personalWorkspaceSlug: "personal-user-1"
};

function renderSidebarRouter() {
  return render(
    <MemoryRouter initialEntries={["/chat"]}>
      <SidebarProvider>
        <AppSidebar
          auth={AUTH_FIXTURE}
          buildSettingsHref={(section) => `/chat?modal=settings&section=${section}`}
        />
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe("account sign-out confirmation", () => {
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

  it("opens confirmation and restores focus to account trigger when canceled", async () => {
    renderSidebarRouter();

    const accountTrigger = screen.getAllByRole("button", { name: "Open account menu" })[0];
    const focusSpy = vi.spyOn(accountTrigger, "focus");
    fireEvent.pointerDown(accountTrigger as HTMLElement);
    fireEvent.click(accountTrigger as HTMLElement);

    fireEvent.click(await screen.findByRole("menuitem", { name: "Log out" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Log out of Compass?")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(focusSpy).toHaveBeenCalled();
  });

  it("submits logout intent to /workspaces when confirmed", async () => {
    renderSidebarRouter();

    const submitEvents: SubmitEvent[] = [];
    const handleSubmit = (event: Event) => {
      event.preventDefault();
      submitEvents.push(event as SubmitEvent);
    };
    document.addEventListener("submit", handleSubmit);

    try {
      const accountTrigger = screen.getAllByRole("button", { name: "Open account menu" })[0];
      fireEvent.pointerDown(accountTrigger as HTMLElement);
      fireEvent.click(accountTrigger as HTMLElement);

      fireEvent.click(await screen.findByRole("menuitem", { name: "Log out" }));

      const dialog = await screen.findByRole("alertdialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Log out" }));

      expect(submitEvents.length).toBe(1);

      const submittedForm = submitEvents[0]?.target as HTMLFormElement;
      expect(submittedForm.getAttribute("action")).toContain("/workspaces");
      expect(new FormData(submittedForm).get("intent")).toBe("logout");
    } finally {
      document.removeEventListener("submit", handleSubmit);
    }
  });
});
