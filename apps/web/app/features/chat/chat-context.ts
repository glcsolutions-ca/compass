import type { AuthShellLoaderData } from "~/features/auth/types";

export function resolveThreadCreateTenantSlug(auth: AuthShellLoaderData): string {
  const lastActive = auth.lastActiveTenantSlug?.trim();
  if (lastActive) {
    return lastActive;
  }

  const activeMembership = auth.memberships.find((membership) => membership.status === "active");
  const activeTenantSlug = activeMembership?.tenantSlug?.trim();
  if (activeTenantSlug) {
    return activeTenantSlug;
  }

  throw new Error("Personal workspace membership is required but was not found in /v1/auth/me.");
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
