export interface OrganizationMembership {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: "owner" | "admin" | "member";
  status: "active" | "invited" | "disabled";
}

export interface WorkspaceMembership {
  id: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  slug: string;
  name: string;
  isPersonal: boolean;
  role: "admin" | "member";
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
  organizations: OrganizationMembership[];
  workspaces: WorkspaceMembership[];
  activeWorkspaceSlug: string | null;
  personalWorkspaceSlug: string | null;
}

export type ChatContextMode = "personal";

export interface ShellRouteHandle {
  requiresAuth?: boolean;
  navLabel?: string;
  shellLayout?: "default" | "immersive";
}
