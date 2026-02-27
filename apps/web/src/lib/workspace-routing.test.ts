import { describe, expect, it } from "vitest";
import {
  isTenantScopedPath,
  resolveWorkspaceHref,
  swapTenantSlugInPath
} from "~/features/workspace/workspace-routing";

describe("workspace routing utilities", () => {
  it("detects tenant scoped paths", () => {
    expect(isTenantScopedPath("/t/acme/chat")).toBe(true);
    expect(isTenantScopedPath("/workspaces")).toBe(false);
  });

  it("swaps tenant slug in existing tenant path", () => {
    expect(swapTenantSlugInPath("/t/acme/chat", "globex")).toBe("/t/globex/chat");
  });

  it("normalizes root tenant paths to chat when switching workspaces", () => {
    expect(swapTenantSlugInPath("/t/acme", "globex")).toBe("/t/globex/chat");
    expect(swapTenantSlugInPath("/t/acme/", "globex")).toBe("/t/globex/chat");
  });

  it("falls back to tenant chat route when path is not tenant-scoped", () => {
    expect(swapTenantSlugInPath("/workspaces", "globex")).toBe("/t/globex/chat");
  });

  it("preserves query and hash during workspace switching", () => {
    const href = resolveWorkspaceHref(
      {
        pathname: "/t/acme/chat",
        search: "?tab=recent",
        hash: "#latest"
      },
      "globex"
    );

    expect(href).toBe("/t/globex/chat?tab=recent#latest");
  });
});
