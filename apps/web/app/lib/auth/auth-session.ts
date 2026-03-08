import { redirect } from "react-router";
import { logoutSession } from "~/lib/api/compass-client";

export function buildReturnTo(request: Request): string {
  const url = new URL(request.url);
  const pathAndQuery = `${url.pathname}${url.search}`;
  return pathAndQuery.length > 0 ? pathAndQuery : "/";
}

export function resolveReturnTo(candidate: string | null): string {
  if (!candidate) {
    return "/";
  }

  const trimmed = candidate.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  const parsed = new URL(trimmed, "https://compass.local");
  const pathname = parsed.pathname;
  const isCanonicalPath =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/workspaces" ||
    pathname.startsWith("/workspaces/");
  if (!isCanonicalPath) {
    return "/";
  }

  return `${pathname}${parsed.search}`;
}

export function buildEntraStartHref(returnTo: string): string {
  if (returnTo === "/") {
    return "/v1/auth/entra/start";
  }

  return `/v1/auth/entra/start?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function logoutAndRedirect(request: Request): Promise<Response> {
  await logoutSession(request);

  return redirect("/login");
}
