import { redirect } from "react-router";
import { loadAuthShellData } from "~/features/auth/shell-loader";

export async function clientLoader({ request }: { request: Request }): Promise<Response> {
  const auth = await loadAuthShellData({ request });
  if (auth instanceof Response) {
    return auth;
  }

  const workspaceSlug =
    auth.personalWorkspaceSlug?.trim() ||
    auth.activeWorkspaceSlug?.trim() ||
    auth.workspaces.find((workspace) => workspace.status === "active")?.slug?.trim() ||
    null;

  if (!workspaceSlug) {
    return redirect("/workspaces");
  }

  return redirect(`/w/${encodeURIComponent(workspaceSlug)}/chat`);
}

export default function ChatRedirectRoute() {
  return null;
}
