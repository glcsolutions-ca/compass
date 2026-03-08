import { redirect } from "react-router";
import { buildWorkspaceAutomationsHref } from "~/lib/routes/workspace-routes";

export async function clientLoader({
  params
}: {
  params: { workspaceSlug?: string };
}): Promise<Response> {
  const workspaceSlug = params.workspaceSlug?.trim();
  return redirect(workspaceSlug ? buildWorkspaceAutomationsHref(workspaceSlug) : "/workspaces");
}

export default function AutomationsLegacyRoute() {
  return null;
}
