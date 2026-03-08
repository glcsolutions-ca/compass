import type { AuthShellLoaderData } from "~/features/auth/types";

export function resolveThreadCreateWorkspaceSlug(auth: AuthShellLoaderData): string {
  const personal = auth.personalWorkspaceSlug?.trim();
  if (personal) {
    return personal;
  }

  const active = auth.activeWorkspaceSlug?.trim();
  if (active) {
    return active;
  }

  const firstActiveWorkspace = auth.workspaces.find((workspace) => workspace.status === "active");
  const slug = firstActiveWorkspace?.slug?.trim();
  if (slug) {
    return slug;
  }

  throw new Error("Workspace membership is required but was not found in /v1/auth/me.");
}

export function readPersonalContextLabel(input: {
  user: {
    displayName: string | null;
    primaryEmail: string | null;
  } | null;
}): string {
  const displayName = input.user?.displayName?.trim();
  if (displayName) {
    return `${displayName} (Personal)`;
  }

  const email = input.user?.primaryEmail?.trim();
  if (email) {
    return `${email} (Personal)`;
  }

  return "Personal";
}
