import { Check } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { WorkspaceMembership, WorkspaceMenuItem } from "~/features/auth/types";
import { resolveWorkspaceHref } from "~/features/workspace/workspace-routing";
import { cn } from "~/lib/utils/cn";

function readMembershipPriority(
  membership: WorkspaceMembership,
  activeTenantSlug: string | null,
  lastActiveTenantSlug: string | null
): number {
  if (activeTenantSlug && membership.tenantSlug === activeTenantSlug) {
    return 0;
  }

  if (
    lastActiveTenantSlug &&
    membership.tenantSlug === lastActiveTenantSlug &&
    membership.tenantSlug !== activeTenantSlug
  ) {
    return 1;
  }

  return 2;
}

function sortMemberships(
  memberships: WorkspaceMembership[],
  activeTenantSlug: string | null,
  lastActiveTenantSlug: string | null
): WorkspaceMembership[] {
  return [...memberships].sort((left, right) => {
    const leftPriority = readMembershipPriority(left, activeTenantSlug, lastActiveTenantSlug);
    const rightPriority = readMembershipPriority(right, activeTenantSlug, lastActiveTenantSlug);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    const nameCompare = left.tenantName.localeCompare(right.tenantName, undefined, {
      sensitivity: "base"
    });
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return left.tenantSlug.localeCompare(right.tenantSlug);
  });
}

export function buildWorkspaceMenuItems(
  memberships: WorkspaceMembership[],
  activeTenantSlug: string | null,
  lastActiveTenantSlug: string | null = null
): WorkspaceMenuItem[] {
  return sortMemberships(memberships, activeTenantSlug, lastActiveTenantSlug).map((membership) => ({
    ...membership,
    active: activeTenantSlug === membership.tenantSlug
  }));
}

export function WorkspaceSwitcher({
  memberships,
  activeTenantSlug,
  lastActiveTenantSlug = null,
  onSelect
}: {
  memberships: WorkspaceMembership[];
  activeTenantSlug: string | null;
  lastActiveTenantSlug?: string | null;
  onSelect?: () => void;
}) {
  const location = useLocation();
  const menuItems = buildWorkspaceMenuItems(memberships, activeTenantSlug, lastActiveTenantSlug);

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
