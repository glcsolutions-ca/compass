import { redirect } from "react-router";
import { loadAuthShellData, type AuthShellLoaderData } from "~/shell/shell-loader";

export async function loadAppRootData({
  request
}: {
  request: Request;
}): Promise<AuthShellLoaderData | Response> {
  const auth = await loadAuthShellData({ request });
  if (auth instanceof Response) {
    return auth;
  }
  const pathname = new URL(request.url).pathname;

  if (auth.memberships.length === 0 && pathname.startsWith("/t/")) {
    return redirect("/workspaces");
  }

  return auth;
}
