import { z } from "zod";
import type { AuthShellLoaderData, WorkspaceMembership } from "~/features/auth/types";

const MembershipSchema = z.object({
  tenantId: z.string().min(1),
  tenantSlug: z.string().min(1),
  tenantName: z.string().min(1),
  role: z.enum(["owner", "admin", "member", "viewer"]),
  status: z.enum(["active", "invited", "disabled"])
});

const AuthMeSchema = z.object({
  authenticated: z.boolean(),
  user: z
    .object({
      id: z.string().min(1),
      primaryEmail: z.string().nullable().optional(),
      displayName: z.string().nullable().optional()
    })
    .nullable()
    .optional(),
  memberships: z.array(MembershipSchema),
  lastActiveTenantSlug: z.string().nullable().optional()
});

function findMembershipBySlug(
  memberships: WorkspaceMembership[],
  tenantSlug: string | null
): WorkspaceMembership | null {
  if (!tenantSlug) {
    return null;
  }

  const normalized = tenantSlug.trim();
  if (normalized.length === 0) {
    return null;
  }

  return memberships.find((membership) => membership.tenantSlug === normalized) ?? null;
}

export function parseAuthShellData(payload: unknown): AuthShellLoaderData | null {
  const parsed = AuthMeSchema.safeParse(payload);
  if (!parsed.success || parsed.data.authenticated !== true) {
    return null;
  }

  const user = parsed.data.user ?? null;

  return {
    authenticated: true,
    user: user
      ? {
          id: user.id,
          primaryEmail: user.primaryEmail ?? null,
          displayName: user.displayName ?? null
        }
      : null,
    memberships: parsed.data.memberships,
    lastActiveTenantSlug: parsed.data.lastActiveTenantSlug ?? null
  };
}

export function resolveDefaultTenantSlug(data: {
  memberships: WorkspaceMembership[];
  lastActiveTenantSlug: string | null;
}): string | null {
  const fromLastActive = findMembershipBySlug(data.memberships, data.lastActiveTenantSlug);
  if (fromLastActive) {
    return fromLastActive.tenantSlug;
  }

  return data.memberships[0]?.tenantSlug ?? null;
}

export function resolveAuthenticatedLandingPath(data: {
  memberships: WorkspaceMembership[];
  lastActiveTenantSlug: string | null;
}): string {
  const tenantSlug = resolveDefaultTenantSlug(data);
  if (!tenantSlug) {
    return "/workspaces";
  }

  return `/t/${encodeURIComponent(tenantSlug)}/chat`;
}
