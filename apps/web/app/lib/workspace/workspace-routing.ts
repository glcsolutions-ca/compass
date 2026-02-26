const TENANT_SEGMENT = "/t/";

export function isTenantScopedPath(pathname: string): boolean {
  return /^\/t\/[^/]+(?:\/|$)/u.test(pathname);
}

export function swapTenantSlugInPath(pathname: string, tenantSlug: string): string {
  const normalizedSlug = tenantSlug.trim();
  if (normalizedSlug.length === 0) {
    return pathname;
  }

  if (!isTenantScopedPath(pathname)) {
    return `/t/${encodeURIComponent(normalizedSlug)}/chat`;
  }

  const segmentStart = pathname.indexOf(TENANT_SEGMENT) + TENANT_SEGMENT.length;
  const segmentEnd = pathname.indexOf("/", segmentStart);

  if (segmentEnd === -1) {
    return `/t/${encodeURIComponent(normalizedSlug)}`;
  }

  return `/t/${encodeURIComponent(normalizedSlug)}${pathname.slice(segmentEnd)}`;
}

export function resolveWorkspaceHref(
  current: { pathname: string; search: string; hash: string },
  tenantSlug: string
): string {
  const nextPath = swapTenantSlugInPath(current.pathname, tenantSlug);
  return `${nextPath}${current.search}${current.hash}`;
}
