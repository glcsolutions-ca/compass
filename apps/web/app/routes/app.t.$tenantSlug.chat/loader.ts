import { redirect } from "react-router";
import { getTenant } from "~/lib/api/compass-client";
import { buildReturnTo } from "~/lib/auth/auth-session";

export interface ChatLoaderData {
  tenantSlug: string;
  tenantName: string;
}

function readTenantName(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const tenant = (payload as { tenant?: unknown }).tenant;
  if (!tenant || typeof tenant !== "object") {
    return null;
  }

  const name = (tenant as { name?: unknown }).name;
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
}

export async function loadTenantChatData({
  request,
  params
}: {
  request: Request;
  params: { tenantSlug?: string };
}): Promise<ChatLoaderData | Response> {
  const tenantSlug = params.tenantSlug?.trim();
  if (!tenantSlug) {
    return redirect("/workspaces");
  }

  const result = await getTenant(request, tenantSlug);

  if (result.status === 401) {
    return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
  }

  if (result.status === 403) {
    return redirect("/workspaces?error=forbidden");
  }

  if (result.status === 404) {
    return redirect("/workspaces?error=not_found");
  }

  if (!result.data) {
    throw new Error("Unable to load tenant context for chat route.");
  }

  return {
    tenantSlug,
    tenantName: readTenantName(result.data) ?? tenantSlug
  };
}
