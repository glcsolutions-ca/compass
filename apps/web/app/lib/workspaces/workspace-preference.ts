import type { AuthShellLoaderData } from "~/features/auth/types";

export const PREFERRED_WORKSPACE_STORAGE_KEY = "compass-preferred-workspace";

function normalizeWorkspaceSlug(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function readPreferredWorkspaceSlug(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = normalizeWorkspaceSlug(
    window.localStorage.getItem(PREFERRED_WORKSPACE_STORAGE_KEY)
  );
  return value.length > 0 ? value : null;
}

export function writePreferredWorkspaceSlug(workspaceSlug: string | null | undefined): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeWorkspaceSlug(workspaceSlug);
  if (!normalized) {
    window.localStorage.removeItem(PREFERRED_WORKSPACE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(PREFERRED_WORKSPACE_STORAGE_KEY, normalized);
}

export function resolvePreferredWorkspaceSlug(auth: AuthShellLoaderData): string | null {
  const preferred = readPreferredWorkspaceSlug();
  if (!preferred) {
    return null;
  }

  const hasAccess = auth.workspaces.some(
    (workspace) => workspace.status === "active" && workspace.slug === preferred
  );

  return hasAccess ? preferred : null;
}
