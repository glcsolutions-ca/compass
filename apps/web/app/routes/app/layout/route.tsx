import { Outlet, redirect, useLoaderData } from "react-router";
import { AppShell } from "~/components/shell/app-shell";
import { loadAuthShellData } from "~/features/auth/shell-loader";
import type { AuthShellLoaderData, ShellRouteHandle } from "~/features/auth/types";

export const handle: ShellRouteHandle = {
  requiresAuth: true
};

export async function clientLoader({
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

export default function AppLayoutRoute() {
  const auth = useLoaderData<AuthShellLoaderData>();

  return (
    <AppShell auth={auth}>
      <Outlet context={{ auth } satisfies { auth: AuthShellLoaderData }} />
    </AppShell>
  );
}
