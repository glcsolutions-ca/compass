import { redirect } from "react-router";
import { buildWorkspaceSettingsHref } from "~/lib/routes/workspace-routes";

export async function clientLoader({
  request,
  params
}: {
  request: Request;
  params: { workspaceSlug?: string };
}): Promise<Response> {
  const workspaceSlug = params.workspaceSlug?.trim();
  if (!workspaceSlug) {
    return redirect("/workspaces");
  }

  const requestUrl = new URL(request.url);
  const destination = new URL(
    buildWorkspaceSettingsHref(workspaceSlug, requestUrl.searchParams.get("section") ?? undefined),
    "http://compass.local"
  );
  return redirect(`${destination.pathname}${destination.search}`);
}

export default function SettingsLegacyRoute() {
  return null;
}
