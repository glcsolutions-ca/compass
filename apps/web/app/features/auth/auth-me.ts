import { z } from "zod";
import type { AuthShellLoaderData } from "~/features/auth/types";

const OrganizationMembershipSchema = z.object({
  organizationId: z.string().min(1),
  organizationSlug: z.string().min(1),
  organizationName: z.string().min(1),
  role: z.enum(["owner", "admin", "member"]),
  status: z.enum(["active", "invited", "disabled"])
});

const WorkspaceSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  organizationSlug: z.string().min(1),
  organizationName: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  isPersonal: z.boolean(),
  role: z.enum(["admin", "member"]),
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
  organizations: z.array(OrganizationMembershipSchema),
  workspaces: z.array(WorkspaceSchema),
  activeWorkspaceSlug: z.string().nullable().optional(),
  personalWorkspaceSlug: z.string().nullable().optional()
});

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
    organizations: parsed.data.organizations,
    workspaces: parsed.data.workspaces,
    activeWorkspaceSlug: parsed.data.activeWorkspaceSlug ?? null,
    personalWorkspaceSlug: parsed.data.personalWorkspaceSlug ?? null
  };
}

export function resolveAuthenticatedLandingPath(data: {
  workspaces: AuthShellLoaderData["workspaces"];
  personalWorkspaceSlug: string | null;
  activeWorkspaceSlug: string | null;
}): string {
  const preferred =
    data.personalWorkspaceSlug?.trim() ||
    data.activeWorkspaceSlug?.trim() ||
    data.workspaces[0]?.slug;
  if (!preferred) {
    return "/workspaces";
  }

  return `/w/${encodeURIComponent(preferred)}/chat`;
}
