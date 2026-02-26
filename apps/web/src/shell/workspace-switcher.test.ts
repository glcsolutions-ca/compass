import { describe, expect, it } from "vitest";
import { buildWorkspaceMenuItems } from "~/shell/workspace-switcher";

describe("workspace switcher", () => {
  it("marks the active workspace", () => {
    const items = buildWorkspaceMenuItems(
      [
        {
          tenantId: "t_1",
          tenantSlug: "acme",
          tenantName: "Acme",
          role: "owner",
          status: "active"
        },
        {
          tenantId: "t_2",
          tenantSlug: "globex",
          tenantName: "Globex",
          role: "member",
          status: "active"
        }
      ],
      "globex"
    );

    expect(items[0]?.active).toBe(false);
    expect(items[1]?.active).toBe(true);
  });
});
