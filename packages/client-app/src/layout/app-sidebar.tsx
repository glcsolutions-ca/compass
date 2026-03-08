import { useMemo } from "react";
import { Link, useLocation } from "react-router";
import { ChatThreadRail } from "~/layout/chat-thread-rail";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator
} from "@compass/ui/sidebar";
import type { AuthShellLoaderData } from "~/features/auth/types";
import { SidebarAccountMenu } from "~/layout/app-sidebar-account-menu";
import { SidebarBrandControl, SidebarCollapseControl } from "~/layout/app-sidebar-controls";
import { buildPrimaryItems, buildUtilityItems } from "~/layout/app-sidebar-model";
import type { SettingsSection } from "~/features/settings/types";

export interface AppSidebarProps {
  auth: AuthShellLoaderData;
  buildSettingsHref: (section: SettingsSection) => string;
}

export function AppSidebar({ auth, buildSettingsHref }: AppSidebarProps) {
  const location = useLocation();
  const workspaces = auth.workspaces ?? [];
  const defaultWorkspaceSlug = useMemo(() => {
    return (
      auth.personalWorkspaceSlug?.trim() ||
      auth.activeWorkspaceSlug?.trim() ||
      workspaces.find((workspace) => workspace.status === "active")?.slug ||
      ""
    );
  }, [auth.activeWorkspaceSlug, auth.personalWorkspaceSlug, workspaces]);
  const utilityItems = useMemo(
    () =>
      buildUtilityItems({
        defaultWorkspaceSlug,
        pathname: location.pathname
      }),
    [defaultWorkspaceSlug, location.pathname]
  );
  const primaryItems = useMemo(
    () =>
      buildPrimaryItems({
        defaultWorkspaceSlug,
        pathname: location.pathname
      }),
    [defaultWorkspaceSlug, location.pathname]
  );

  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar">
      <SidebarHeader className="px-3 pb-2 pt-3 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2">
          <SidebarBrandControl />
          <SidebarCollapseControl />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pb-3">
        <SidebarGroup className="px-0 pt-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {utilityItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}>
                      <Link
                        aria-current={item.active ? "page" : undefined}
                        aria-label={item.label}
                        to={item.to}
                      >
                        <ItemIcon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="px-0 pt-0">
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
            Navigate
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryItems.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}>
                      <Link
                        aria-current={item.active ? "page" : undefined}
                        aria-label={item.label}
                        to={item.to}
                      >
                        <ItemIcon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="px-0 pt-0">
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
            Workspaces
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaces
                .filter((workspace) => workspace.status === "active")
                .map((workspace) => {
                  const href = `/w/${encodeURIComponent(workspace.slug)}/chat`;
                  const active =
                    location.pathname === href ||
                    location.pathname.startsWith(`${href}/`) ||
                    (location.pathname === "/chat" && workspace.slug === defaultWorkspaceSlug);

                  return (
                    <SidebarMenuItem key={workspace.id}>
                      <SidebarMenuButton asChild isActive={active} tooltip={workspace.name}>
                        <Link
                          aria-current={active ? "page" : undefined}
                          aria-label={workspace.name}
                          to={href}
                        >
                          <span>{workspace.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {defaultWorkspaceSlug ? (
          <ChatThreadRail
            defaultWorkspaceSlug={defaultWorkspaceSlug}
            pathname={location.pathname}
          />
        ) : null}
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="px-3 pb-3 pt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarAccountMenu auth={auth} buildSettingsHref={buildSettingsHref} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
