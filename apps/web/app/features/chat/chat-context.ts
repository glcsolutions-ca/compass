import type { AuthShellLoaderData } from "~/features/auth/types";

export function resolveThreadCreateTenantSlug(auth: AuthShellLoaderData): string {
  const lastActive = auth.lastActiveTenantSlug?.trim();
  if (lastActive) {
    return lastActive;
  }

  const firstMembership = auth.memberships[0]?.tenantSlug?.trim();
  if (firstMembership) {
    return firstMembership;
  }

  // Personal-first fallback until backend personal context identifiers are finalized.
  return "personal";
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
