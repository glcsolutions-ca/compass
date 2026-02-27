export interface WorkspaceMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "invited" | "disabled";
}

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

export type ChatContextMode = "personal";

export interface ShellRouteHandle {
  requiresAuth?: boolean;
  navLabel?: string;
}
