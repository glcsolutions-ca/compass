import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { AuthShellLoaderData } from "~/features/auth/types";
import { ProfileMenu } from "~/components/shell/profile-menu";
import { Sidebar } from "~/components/shell/sidebar";

function readActiveTenantSlug(pathname: string): string | null {
  const match = pathname.match(/^\/t\/([^/]+)/u);
  return match?.[1] ?? null;
}

export function AppShell({ auth, children }: { auth: AuthShellLoaderData; children: ReactNode }) {
  const location = useLocation();
  const activeTenantSlug = useMemo(
    () => readActiveTenantSlug(location.pathname),
    [location.pathname]
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="shell-surface flex min-h-screen bg-background text-foreground">
      <Sidebar
        auth={auth}
        mobileOpen={mobileOpen}
        onMobileToggle={() => setMobileOpen(!mobileOpen)}
      />
      <div className="relative flex min-h-screen w-full flex-1 flex-col">
        <main className="relative flex-1 px-4 pb-24 pt-14 md:px-8 md:pt-8">{children}</main>
        <ProfileMenu activeTenantSlug={activeTenantSlug} auth={auth} />
      </div>
    </div>
  );
}
