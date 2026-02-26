import { z } from "zod";
import { redirect } from "react-router";
import { getAuthMe, readApiErrorMessage } from "~/lib/api/compass-client";
import { buildReturnTo } from "~/lib/auth/auth-session";

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

export type WorkspaceMembership = z.infer<typeof MembershipSchema>;

export interface WorkspaceMenuItem extends WorkspaceMembership {
  active: boolean;
}

export interface AuthShellLoaderData {
  authenticated: true;
  user: {
    id: string;
    primaryEmail: string | null;
    displayName: string | null;
  } | null;
  memberships: WorkspaceMembership[];
  lastActiveTenantSlug: string | null;
}

export interface ShellRouteHandle {
  requiresAuth?: boolean;
  requiresTenant?: boolean;
  navLabel?: string;
}

export async function loadAuthShellData({
  request
}: {
  request: Request;
}): Promise<AuthShellLoaderData | Response> {
  const result = await getAuthMe(request);

  if (result.status === 401) {
    return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
  }

  if (!result.data) {
    const message = readApiErrorMessage(result.error, "Unable to load authenticated user context.");
    throw new Error(message);
  }

  const parsed = AuthMeSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.authenticated !== true) {
    return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
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
