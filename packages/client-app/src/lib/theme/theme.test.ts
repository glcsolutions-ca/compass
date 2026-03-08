import { afterEach, describe, expect, it } from "vitest";
import {
  applyPreferencesToRoot,
  LEGACY_THEME_STORAGE_KEY,
  persistPreferences,
  resolveEffectiveMode,
  UI_MODE_STORAGE_KEY,
  UI_THEME_STORAGE_KEY,
  readPreferencesFromStorage
} from "~/lib/theme/theme";

describe("theme helpers", () => {
  afterEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.removeProperty("color-scheme");
    delete document.documentElement.dataset.theme;
    window.localStorage.clear();
  });

  it("falls back to defaults for invalid storage values", () => {
    window.localStorage.setItem(UI_THEME_STORAGE_KEY, "invalid-theme");
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "invalid-mode");

    expect(readPreferencesFromStorage(window.localStorage)).toEqual({
      theme: "compass",
      mode: "system"
    });
  });

  it("migrates legacy compass-theme mode to ui-mode", () => {
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "dark");

    expect(readPreferencesFromStorage(window.localStorage)).toEqual({
      theme: "compass",
      mode: "dark"
    });

    expect(window.localStorage.getItem(UI_MODE_STORAGE_KEY)).toBe("dark");
    expect(window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
  });

  it("applies both theme and effective mode to document root", () => {
    applyPreferencesToRoot(
      document.documentElement,
      {
        theme: "rose",
        mode: "dark"
      },
      false
    );

    expect(document.documentElement.dataset.theme).toBe("rose");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("resolves system mode against current preference", () => {
    expect(resolveEffectiveMode("system", true)).toBe("dark");
    expect(resolveEffectiveMode("system", false)).toBe("light");
  });

  it("gracefully handles restricted storage access", () => {
    const restrictedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      }
    };

    expect(readPreferencesFromStorage(restrictedStorage)).toEqual({
      theme: "compass",
      mode: "system"
    });

    expect(() =>
      persistPreferences(restrictedStorage, {
        theme: "rose",
        mode: "dark"
      })
    ).not.toThrow();
  });
});
