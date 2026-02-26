import { Check } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { WorkspaceMembership, WorkspaceMenuItem } from "~/features/auth/types";
import { resolveWorkspaceHref } from "~/features/workspace/workspace-routing";
import { cn } from "~/lib/utils/cn";

export function buildWorkspaceMenuItems(
  memberships: WorkspaceMembership[],
  activeTenantSlug: string | null
): WorkspaceMenuItem[] {
  return memberships.map((membership) => ({
    ...membership,
    active: activeTenantSlug === membership.tenantSlug
  }));
}

export function WorkspaceSwitcher({
  memberships,
  activeTenantSlug,
  onSelect
}: {
  memberships: WorkspaceMembership[];
  activeTenantSlug: string | null;
  onSelect?: () => void;
}) {
  const location = useLocation();
  const menuItems = buildWorkspaceMenuItems(memberships, activeTenantSlug);

  if (menuItems.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted-foreground">No workspaces found.</p>;
  }

  return (
    <ul className="grid gap-1" data-testid="workspace-switcher-list">
      {menuItems.map((item) => {
        const href = resolveWorkspaceHref(location, item.tenantSlug);

        return (
          <li key={item.tenantId}>
            <Link
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                item.active && "bg-accent"
              )}
              onClick={onSelect}
              to={href}
            >
              <span className="truncate">{item.tenantName}</span>
              {item.active ? <Check className="h-4 w-4 text-primary" /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
