import type { WorkspaceMembership } from "~/features/auth/types";

export const NEW_THREAD_QUERY_PARAM = "thread";
export const NO_MEMBERSHIPS_ERROR_CODE = "no_memberships_for_new_thread";

function normalizeTenantSlug(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function findMembership(
  memberships: WorkspaceMembership[],
  tenantSlug: string | null
): WorkspaceMembership | null {
  const normalizedTenantSlug = normalizeTenantSlug(tenantSlug);
  if (!normalizedTenantSlug) {
    return null;
  }

  return memberships.find((membership) => membership.tenantSlug === normalizedTenantSlug) ?? null;
}

function resolveFallbackTenantSlug(input: {
  memberships: WorkspaceMembership[];
  lastActiveTenantSlug: string | null;
}): string | null {
  const fromLastActive = findMembership(input.memberships, input.lastActiveTenantSlug);
  if (fromLastActive) {
    return fromLastActive.tenantSlug;
  }

  return input.memberships[0]?.tenantSlug ?? null;
}

function createThreadToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveNewThreadTarget(input: {
  activeTenantSlug: string | null;
  memberships: WorkspaceMembership[];
  lastActiveTenantSlug: string | null;
}): string {
  const activeTenantSlug = normalizeTenantSlug(input.activeTenantSlug);
  if (activeTenantSlug) {
    return `/t/${encodeURIComponent(activeTenantSlug)}/chat`;
  }

  const fallbackTenantSlug = resolveFallbackTenantSlug({
    memberships: input.memberships,
    lastActiveTenantSlug: input.lastActiveTenantSlug
  });

  if (fallbackTenantSlug) {
    return `/t/${encodeURIComponent(fallbackTenantSlug)}/chat`;
  }

  return `/workspaces?error=${NO_MEMBERSHIPS_ERROR_CODE}`;
}

export function buildNewThreadHref(
  input: {
    activeTenantSlug: string | null;
    memberships: WorkspaceMembership[];
    lastActiveTenantSlug: string | null;
  },
  options?: {
    threadToken?: string;
  }
): string {
  const target = resolveNewThreadTarget(input);
  if (!target.startsWith("/t/")) {
    return target;
  }

  const url = new URL(target, "http://compass.local");
  url.search = "";
  url.searchParams.set(NEW_THREAD_QUERY_PARAM, options?.threadToken ?? createThreadToken());
  return `${url.pathname}?${url.searchParams.toString()}`;
}
