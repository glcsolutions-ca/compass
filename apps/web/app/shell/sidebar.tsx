import { MessageSquareText, PanelLeftClose, PanelLeftOpen, Rows3 } from "lucide-react";
import { Link, NavLink } from "react-router";
import type { AuthShellLoaderData } from "~/shell/shell-loader";
import { CompassMark } from "~/ui/icons/compass-mark";
import { Button } from "~/ui/shadcn/button";
import { cn } from "~/lib/ui/cn";

function resolvePrimaryWorkspaceSlug(auth: AuthShellLoaderData): string | null {
  if (auth.memberships.length === 0) {
    return null;
  }

  if (auth.lastActiveTenantSlug) {
    const hasLastActive = auth.memberships.some(
      (membership) => membership.tenantSlug === auth.lastActiveTenantSlug
    );
    if (hasLastActive) {
      return auth.lastActiveTenantSlug;
    }
  }

  return auth.memberships[0]?.tenantSlug ?? null;
}

export function Sidebar({
  auth,
  mobileOpen,
  onMobileToggle
}: {
  auth: AuthShellLoaderData;
  mobileOpen: boolean;
  onMobileToggle: () => void;
}) {
  const primaryTenantSlug = resolvePrimaryWorkspaceSlug(auth);
  const chatHref = primaryTenantSlug ? `/t/${primaryTenantSlug}/chat` : "/workspaces";

  return (
    <>
      <Button
        className="fixed left-3 top-3 z-30 md:hidden"
        onClick={onMobileToggle}
        size="icon"
        type="button"
        variant="outline"
      >
        {mobileOpen ? (
          <PanelLeftClose className="h-4 w-4" />
        ) : (
          <PanelLeftOpen className="h-4 w-4" />
        )}
      </Button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 w-64 border-r border-border bg-card/90 px-3 pb-4 pt-3 backdrop-blur md:static md:translate-x-0",
          "transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <Link className="rounded-md px-1 py-1 hover:bg-accent" to="/workspaces">
            <CompassMark />
          </Link>
          <Rows3 className="h-4 w-4 text-muted-foreground" />
        </div>

        <nav className="grid gap-1">
          <NavLink
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground"
              )
            }
            to={chatHref}
          >
            <MessageSquareText className="h-4 w-4" />
            Chat
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground"
              )
            }
            to="/workspaces"
          >
            <Rows3 className="h-4 w-4" />
            Workspaces
          </NavLink>
        </nav>
      </aside>

      {mobileOpen ? (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-10 bg-background/70 md:hidden"
          onClick={onMobileToggle}
          type="button"
        />
      ) : null}
    </>
  );
}
