function normalizeWorkspaceSlug(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function buildWorkspaceSettingsHref(workspaceSlug: string, section?: string): string {
  const normalizedWorkspaceSlug = normalizeWorkspaceSlug(workspaceSlug);
  if (!normalizedWorkspaceSlug) {
    return "/workspaces";
  }

  const url = new URL(
    `/workspaces/${encodeURIComponent(normalizedWorkspaceSlug)}/settings`,
    "http://compass.local"
  );
  if (section?.trim()) {
    url.searchParams.set("section", section.trim());
  }
  return `${url.pathname}${url.search}`;
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
