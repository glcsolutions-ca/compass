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
  const normalizedTenantPath = `/t/${encodeURIComponent(normalizedSlug)}`;

  if (segmentEnd === -1) {
    return `${normalizedTenantPath}/chat`;
  }

  const remainder = pathname.slice(segmentEnd);
  if (remainder === "/" || remainder.length === 0) {
    return `${normalizedTenantPath}/chat`;
  }

  return `${normalizedTenantPath}${remainder}`;
}

export function resolveWorkspaceHref(
  current: { pathname: string; search: string; hash: string },
  tenantSlug: string
): string {
  const nextPath = swapTenantSlugInPath(current.pathname, tenantSlug);
  return `${nextPath}${current.search}${current.hash}`;
}
