import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeControls } from "~/components/shell/theme-controls";
import { UI_MODE_STORAGE_KEY, UI_THEME_STORAGE_KEY } from "~/lib/theme/theme";

let mediaMatches = false;
const mediaListeners: Array<(event: MediaQueryListEvent) => void> = [];

function emitMediaChange(nextMatches: boolean): void {
  mediaMatches = nextMatches;
  for (const listener of mediaListeners) {
    listener({ matches: nextMatches } as MediaQueryListEvent);
  }
}

describe("theme controls", () => {
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

    render(<ThemeControls />);

    const slateButton = await screen.findByRole("button", { name: "Slate theme" });

    fireEvent.mouseEnter(slateButton);
    expect(document.documentElement.dataset.theme).toBe("slate");

    fireEvent.pointerLeave(screen.getByLabelText("Appearance settings"));
    expect(document.documentElement.dataset.theme).toBe("compass");

    fireEvent.click(slateButton);
    expect(window.localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe("slate");
    expect(document.documentElement.dataset.theme).toBe("slate");
  });

  it("persists mode changes and applies dark class", async () => {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, "compass");
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "light");

    render(<ThemeControls />);

    const darkModeButton = await screen.findByRole("radio", { name: "Dark mode" });
    fireEvent.click(darkModeButton);

    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("updates dark mode while in system mode when media preference changes", async () => {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, "compass");
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "system");

    render(<ThemeControls />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    emitMediaChange(true);

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
  });
});
