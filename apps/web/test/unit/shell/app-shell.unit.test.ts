import { afterEach, describe, expect, it } from "vitest";
import { __private__ } from "~/components/shell/app-shell";

describe("app shell sidebar state", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to open when no preference is saved", () => {
    expect(__private__.resolveInitialSidebarOpen()).toBe(true);
  });

  it("resolves persisted false state", () => {
    window.localStorage.setItem(__private__.SIDEBAR_OPEN_STORAGE_KEY, "false");

    expect(__private__.resolveInitialSidebarOpen()).toBe(false);
  });

  it("persists sidebar open state", () => {
    __private__.persistSidebarOpenState(false);

    expect(window.localStorage.getItem(__private__.SIDEBAR_OPEN_STORAGE_KEY)).toBe("false");
  });
});
