import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeStudio } from "~/components/shell/theme-studio";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "~/components/ui/dropdown-menu";
import { UI_MODE_STORAGE_KEY, UI_THEME_STORAGE_KEY } from "~/lib/theme/theme";

let mediaMatches = false;
const mediaListeners: Array<(event: MediaQueryListEvent) => void> = [];

function emitMediaChange(nextMatches: boolean): void {
  mediaMatches = nextMatches;
  for (const listener of mediaListeners) {
    listener({ matches: nextMatches } as MediaQueryListEvent);
  }
}

function ThemeStudioHarness() {
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <button type="button">Account</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeStudio />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("theme studio", () => {
  beforeEach(() => {
    mediaMatches = false;
    mediaListeners.length = 0;

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        get matches() {
          return mediaMatches;
        },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_eventName: string, listener: (event: MediaQueryListEvent) => void) => {
          mediaListeners.push(listener);
        },
        removeEventListener: (
          _eventName: string,
          listener: (event: MediaQueryListEvent) => void
        ) => {
          const index = mediaListeners.indexOf(listener);
          if (index >= 0) {
            mediaListeners.splice(index, 1);
          }
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.removeProperty("color-scheme");
    delete document.documentElement.dataset.theme;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("previews on hover, restores on leave, and commits on click", async () => {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, "compass");
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "light");

    render(<ThemeStudioHarness />);

    fireEvent.click(screen.getAllByRole("menuitem", { name: "Theme Studio" })[0] as HTMLElement);
    const slateButton = await screen.findByRole("button", { name: "Slate theme" });

    fireEvent.mouseEnter(slateButton);
    expect(document.documentElement.dataset.theme).toBe("slate");

    const menus = screen.getAllByRole("menu");
    fireEvent.pointerLeave(menus[menus.length - 1] as HTMLElement);
    expect(document.documentElement.dataset.theme).toBe("compass");

    fireEvent.click(slateButton);
    expect(window.localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe("slate");
    expect(document.documentElement.dataset.theme).toBe("slate");
  });

  it("persists mode changes and applies dark class", async () => {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, "compass");
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "light");

    render(<ThemeStudioHarness />);

    fireEvent.click(screen.getAllByRole("menuitem", { name: "Theme Studio" })[0] as HTMLElement);
    const darkMode = await screen.findByRole("menuitemradio", { name: /dark/i });

    fireEvent.click(darkMode);

    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("updates dark mode while in system mode when media preference changes", async () => {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, "compass");
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "system");

    render(<ThemeStudioHarness />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    emitMediaChange(true);

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });
});
