import { afterEach, describe, expect, it, vi } from "vitest";
import { __private__ } from "~/components/shell/theme-toggle";

describe("theme toggle internals", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.removeProperty("color-scheme");
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("resolves persisted theme from local storage", () => {
    window.localStorage.setItem(__private__.THEME_STORAGE_KEY, "dark");

    expect(__private__.resolveInitialTheme()).toBe("dark");
  });

  it("applies theme to document root and persists it", () => {
    __private__.applyTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(__private__.THEME_STORAGE_KEY)).toBe("dark");
  });
});
