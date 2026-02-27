import { describe, expect, it } from "vitest";
import {
  buildNewThreadHref,
  NO_MEMBERSHIPS_ERROR_CODE,
  resolveNewThreadTarget
} from "~/features/chat/new-thread-routing";
import type { WorkspaceMembership } from "~/features/auth/types";

const MEMBERSHIPS: WorkspaceMembership[] = [
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
];

describe("new thread routing", () => {
  it("prefers active tenant slug for new thread target", () => {
    const target = resolveNewThreadTarget({
      activeTenantSlug: "acme",
      memberships: MEMBERSHIPS,
      lastActiveTenantSlug: "globex"
    });

    expect(target).toBe("/t/acme/chat");
  });

  it("falls back to last active tenant then primary membership", () => {
    const fromLastActive = resolveNewThreadTarget({
      activeTenantSlug: null,
      memberships: MEMBERSHIPS,
      lastActiveTenantSlug: "globex"
    });
    const fromPrimary = resolveNewThreadTarget({
      activeTenantSlug: null,
      memberships: MEMBERSHIPS,
      lastActiveTenantSlug: "unknown"
    });

    expect(fromLastActive).toBe("/t/globex/chat");
    expect(fromPrimary).toBe("/t/acme/chat");
  });

  it("routes to workspaces error fallback when memberships are unavailable", () => {
    const target = resolveNewThreadTarget({
      activeTenantSlug: null,
      memberships: [],
      lastActiveTenantSlug: null
    });

    expect(target).toBe(`/workspaces?error=${NO_MEMBERSHIPS_ERROR_CODE}`);
  });

  it("adds a fresh thread token to tenant chat targets", () => {
    const href = buildNewThreadHref(
      {
        activeTenantSlug: "acme",
        memberships: MEMBERSHIPS,
        lastActiveTenantSlug: "globex"
      },
      {
        threadToken: "thread-123"
      }
    );

    expect(href).toBe("/t/acme/chat?thread=thread-123");
  });

  it("does not append thread token when redirecting to workspace fallback", () => {
    const href = buildNewThreadHref(
      {
        activeTenantSlug: null,
        memberships: [],
        lastActiveTenantSlug: null
      },
      {
        threadToken: "thread-123"
      }
    );

    expect(href).toBe(`/workspaces?error=${NO_MEMBERSHIPS_ERROR_CODE}`);
  });
});
