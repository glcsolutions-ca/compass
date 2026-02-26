import { redirect } from "react-router";
import { getAuthMe } from "~/lib/api/compass-client";
import { buildEntraStartHref } from "~/lib/auth/auth-session";
import { readLoginQuery } from "./schema";

export interface LoginLoaderData {
  signInHref: string;
  adminConsentHref: string;
  showAdminConsentNotice: boolean;
  showAdminConsentSuccess: boolean;
}

function resolveTargetFromMemberships(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "/workspaces";
  }

  const record = payload as {
    authenticated?: unknown;
    lastActiveTenantSlug?: unknown;
    memberships?: Array<{ tenantSlug?: unknown }>;
  };

  if (record.authenticated !== true) {
    return "/login";
  }

  const lastActive =
    typeof record.lastActiveTenantSlug === "string" ? record.lastActiveTenantSlug.trim() : "";
  if (lastActive.length > 0) {
    return `/t/${encodeURIComponent(lastActive)}/chat`;
  }

  if (Array.isArray(record.memberships) && record.memberships.length > 0) {
    const firstSlug =
      typeof record.memberships[0]?.tenantSlug === "string"
        ? record.memberships[0].tenantSlug.trim()
        : "";

    if (firstSlug.length > 0) {
      return `/t/${encodeURIComponent(firstSlug)}/chat`;
    }
  }

  return "/workspaces";
}

export async function loadLoginRouteData({
  request
}: {
  request: Request;
}): Promise<LoginLoaderData | Response> {
  const url = new URL(request.url);
  const query = readLoginQuery(url);

  const authResult = await getAuthMe(request);

  if (authResult.status === 200 && authResult.data) {
    return redirect(resolveTargetFromMemberships(authResult.data));
  }

  const adminConsentParams = new URLSearchParams({
    returnTo: query.returnTo
  });

  if (query.tenantHint.length > 0) {
    adminConsentParams.set("tenantHint", query.tenantHint);
  }

  return {
    signInHref: buildEntraStartHref(query.returnTo),
    adminConsentHref: `/v1/auth/entra/admin-consent/start?${adminConsentParams.toString()}`,
    showAdminConsentNotice: query.error === "admin_consent_required" || query.consent === "denied",
    showAdminConsentSuccess: query.consent === "granted"
  };
}
