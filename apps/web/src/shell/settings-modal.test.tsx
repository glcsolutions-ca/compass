import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "~/components/shell/settings-modal";
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
    }
  ],
  lastActiveTenantSlug: "acme"
};

describe("settings modal", () => {
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

  it("renders general section and theme controls", () => {
    render(
      <SettingsModal
        auth={AUTH_FIXTURE}
        onOpenChange={vi.fn()}
        onSectionChange={vi.fn()}
        open
        section="general"
      />
    );

    expect(screen.getByRole("tab", { name: "General" })).toBeTruthy();
    expect(screen.getByText("Appearance")).toBeTruthy();
  });

  it("calls section change when selecting personalization", () => {
    const onSectionChange = vi.fn();

    render(
      <SettingsModal
        auth={AUTH_FIXTURE}
        onOpenChange={vi.fn()}
        onSectionChange={onSectionChange}
        open
        section="general"
      />
    );

    const personalizationTab = screen.getByRole("tab", { name: "Personalization" });
    fireEvent.pointerDown(personalizationTab);
    fireEvent.click(personalizationTab);

    expect(onSectionChange).toHaveBeenCalledWith("personalization");
  });

  it("calls onOpenChange when close button is pressed", () => {
    const onOpenChange = vi.fn();

    render(
      <SettingsModal
        auth={AUTH_FIXTURE}
        onOpenChange={onOpenChange}
        onSectionChange={vi.fn()}
        open
        section="general"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
