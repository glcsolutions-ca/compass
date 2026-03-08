import type { AuthShellLoaderData } from "~/features/auth/types";
import { readPreferredWorkspaceSlug } from "~/lib/workspaces/workspace-preference";

function readDefaultWorkspaceSlug(auth: AuthShellLoaderData): string {
  return (
    auth.personalWorkspaceSlug?.trim() ||
    auth.activeWorkspaceSlug?.trim() ||
    auth.workspaces.find((workspace) => workspace.status === "active")?.slug ||
    ""
  );
}

function readMatchWorkspaceSlug(matches: ReadonlyArray<{ data?: unknown }>): string | null {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = matches[index]?.data;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const workspaceSlug = (candidate as { workspaceSlug?: unknown }).workspaceSlug;
    if (typeof workspaceSlug === "string" && workspaceSlug.trim().length > 0) {
      return workspaceSlug.trim();
    }
  }

  return null;
}

export function resolveCurrentWorkspaceSlug(input: {
  auth: AuthShellLoaderData;
  pathname: string;
  search: string;
  matches: ReadonlyArray<{ data?: unknown }>;
}): string {
  const workspacePathMatch = /^\/workspaces\/([^/]+)(?:\/|$)/u.exec(input.pathname);
  if (workspacePathMatch?.[1]) {
    return decodeURIComponent(workspacePathMatch[1]).trim();
  }

  const preferredWorkspaceSlug = readPreferredWorkspaceSlug();
  if (preferredWorkspaceSlug) {
    return preferredWorkspaceSlug;
  }

  const matchWorkspaceSlug = readMatchWorkspaceSlug(input.matches);
  if (matchWorkspaceSlug) {
    return matchWorkspaceSlug;
  }

  return readDefaultWorkspaceSlug(input.auth);
}
