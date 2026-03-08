import { redirect } from "react-router";
import { buildWorkspaceSkillsHref } from "~/lib/routes/workspace-routes";

export async function clientLoader({
  params
}: {
  params: { workspaceSlug?: string };
}): Promise<Response> {
  const workspaceSlug = params.workspaceSlug?.trim();
  return redirect(workspaceSlug ? buildWorkspaceSkillsHref(workspaceSlug) : "/workspaces");
}

export default function SkillsLegacyRoute() {
  return null;
}
