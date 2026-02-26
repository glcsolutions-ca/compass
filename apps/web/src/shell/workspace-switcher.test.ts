import { describe, expect, it } from "vitest";
import { buildWorkspaceMenuItems } from "~/components/shell/workspace-switcher";

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

    expect(items[0]?.tenantSlug).toBe("globex");
    expect(items[0]?.active).toBe(true);
    expect(items[1]?.tenantSlug).toBe("acme");
    expect(items[1]?.active).toBe(false);
  });

  it("orders workspaces as active, last active, then alphabetical", () => {
    const items = buildWorkspaceMenuItems(
      [
        {
          tenantId: "t_1",
          tenantSlug: "globex",
          tenantName: "Globex",
          role: "member",
          status: "active"
        },
        {
          tenantId: "t_2",
          tenantSlug: "acme",
          tenantName: "Acme",
          role: "owner",
          status: "active"
        },
        {
          tenantId: "t_3",
          tenantSlug: "umbrella",
          tenantName: "Umbrella",
          role: "viewer",
          status: "active"
        }
      ],
      "umbrella",
      "globex"
    );

    expect(items.map((item) => item.tenantSlug)).toEqual(["umbrella", "globex", "acme"]);
    expect(items[0]?.active).toBe(true);
  });
});
