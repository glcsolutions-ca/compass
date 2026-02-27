import { Outlet, useLoaderData } from "react-router";
import { AppShell } from "~/components/shell/app-shell";
import { submitShellAction } from "~/features/auth/shell-action";
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

  return auth;
}

export async function clientAction({ request }: { request: Request }): Promise<Response> {
  return submitShellAction({ request });
}

export default function AppLayoutRoute() {
  const auth = useLoaderData<AuthShellLoaderData>();

  return (
    <AppShell auth={auth}>
      <Outlet context={{ auth } satisfies { auth: AuthShellLoaderData }} />
    </AppShell>
  );
}
