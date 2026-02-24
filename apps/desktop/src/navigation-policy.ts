const ALLOWED_NAVIGATION_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:", "mailto:"]);

export function toHttpOrigin(rawUrl: string): string {
  const parsed = new URL(rawUrl);

  if (!ALLOWED_NAVIGATION_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported navigation protocol: ${parsed.protocol}`);
  }

  return parsed.origin;
}

export function parseOriginAllowlist(entries: readonly string[]): Set<string> {
  const origins = new Set<string>();

  for (const entry of entries) {
    const normalized = entry.trim();

    if (normalized.length === 0) {
      continue;
    }

    origins.add(toHttpOrigin(normalized));
  }

  return origins;
}

export function isNavigationAllowed(rawUrl: string, allowedOrigins: ReadonlySet<string>): boolean {
  try {
    return allowedOrigins.has(toHttpOrigin(rawUrl));
  } catch {
    return false;
  }
}

export function assertExternalOpenAllowed(rawUrl: string): URL {
  const parsed = new URL(rawUrl);

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported external URL protocol: ${parsed.protocol}`);
  }

  return parsed;
}
