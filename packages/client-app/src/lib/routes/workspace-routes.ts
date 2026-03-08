function normalizeWorkspaceSlug(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function buildWorkspaceSkillsHref(workspaceSlug: string): string {
  const normalizedWorkspaceSlug = normalizeWorkspaceSlug(workspaceSlug);
  if (!normalizedWorkspaceSlug) {
    return "/workspaces";
  }

  return `/workspaces/${encodeURIComponent(normalizedWorkspaceSlug)}/skills`;
}

export function buildWorkspaceAutomationsHref(workspaceSlug: string): string {
  const normalizedWorkspaceSlug = normalizeWorkspaceSlug(workspaceSlug);
  if (!normalizedWorkspaceSlug) {
    return "/workspaces";
  }

  return `/workspaces/${encodeURIComponent(normalizedWorkspaceSlug)}/automations`;
}
