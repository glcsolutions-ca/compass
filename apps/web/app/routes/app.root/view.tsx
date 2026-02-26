import { Outlet } from "react-router";
import { AppShell } from "~/shell/app-shell";
import type { AppRootOutletContext } from "~/shell/app-root-context";
import type { AuthShellLoaderData } from "~/shell/shell-loader";

export function AppRootView({ data }: { data: AuthShellLoaderData }) {
  return (
    <AppShell auth={data}>
      <Outlet context={{ auth: data } satisfies AppRootOutletContext} />
    </AppShell>
  );
}
