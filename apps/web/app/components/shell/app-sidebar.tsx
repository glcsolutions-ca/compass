import {
  CircleHelp,
  Check,
  ChevronsUpDown,
  Clock3,
  Compass,
  FolderKanban,
  LogOut,
  MessageSquareText,
  Settings2
} from "lucide-react";
import { useRef, useState } from "react";
import { Form, Link, useLocation } from "react-router";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "~/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "~/components/ui/dropdown-menu";
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
} from "~/components/ui/sidebar";
import type { AuthShellLoaderData } from "~/features/auth/types";
import type { SettingsSection } from "~/features/settings/types";
import { resolveWorkspaceHref } from "~/features/workspace/workspace-routing";
import { cn } from "~/lib/utils/cn";
import { buildWorkspaceMenuItems } from "~/components/shell/workspace-switcher";

export interface AppSidebarProps {
  auth: AuthShellLoaderData;
  activeTenantSlug: string | null;
  buildSettingsHref: (section: SettingsSection) => string;
}

interface SignOutConfirmState {
  open: boolean;
}

interface PrimaryNavItem {
  label: string;
  to: string;
  icon: typeof MessageSquareText;
  active: boolean;
}

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

function readInitials(value: string): string {
  const segments = value
    .trim()
    .split(/\s+/u)
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return "CP";
  }

  return segments
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("");
}

function readWorkspaceMonogram(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "?";
  }

  return trimmed[0]?.toUpperCase() ?? "?";
}

function SidebarAccountMenu({
  auth,
  buildSettingsHref
}: {
  auth: AuthShellLoaderData;
  buildSettingsHref: (section: SettingsSection) => string;
}) {
  const displayName =
    auth.user?.displayName?.trim() || auth.user?.primaryEmail?.trim() || "Compass User";
  const email = auth.user?.primaryEmail?.trim() || "";
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState<SignOutConfirmState>({
    open: false
  });

  const openSignOutConfirm = () => {
    setMenuOpen(false);
    setSignOutConfirm({ open: true });
  };

  const handleSignOutConfirmOpenChange = (open: boolean) => {
    setSignOutConfirm({ open });

    if (!open) {
      accountTriggerRef.current?.focus();
      requestAnimationFrame(() => {
        accountTriggerRef.current?.focus();
      });
    }
  };

  return (
    <>
      <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            ref={accountTriggerRef}
            aria-label="Open account menu"
            className={cn(
              "h-11 rounded-lg border border-sidebar-border/70 bg-sidebar/80 px-2.5 data-[state=open]:bg-sidebar-accent",
              "group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9",
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-md",
              "group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent",
              "group-data-[collapsible=icon]:px-0"
            )}
            size="lg"
            tooltip="Account"
          >
            <Avatar className="h-7 w-7 rounded-md">
              <AvatarFallback className="rounded-md bg-sidebar-primary/15 text-[11px] font-semibold text-sidebar-primary">
                {readInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-xs font-semibold text-sidebar-foreground">
                {displayName}
              </span>
              {email ? (
                <span className="truncate text-[11px] text-sidebar-foreground/70">{email}</span>
              ) : null}
            </div>
            <ChevronsUpDown className="ml-auto h-4 w-4 text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[19rem] rounded-2xl border-border/70 bg-popover/95 p-2 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-popover/90"
          collisionPadding={12}
          side="top"
          sideOffset={8}
        >
          <DropdownMenuLabel className="rounded-xl px-2 py-2">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-8 w-8 rounded-md">
                <AvatarFallback className="rounded-md bg-primary/15 text-xs font-semibold text-primary">
                  {readInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                {email ? (
                  <p className="truncate text-xs font-normal text-muted-foreground">{email}</p>
                ) : null}
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator className="my-2 bg-border/60" />

          <div className="space-y-1">
            <DropdownMenuItem asChild className="h-11 gap-2.5 rounded-lg px-2.5 text-sm md:h-10">
              <Link to={buildSettingsHref("personalization")}>
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                <span>Personalization</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="h-11 gap-2.5 rounded-lg px-2.5 text-sm md:h-10">
              <Link to={buildSettingsHref("general")}>
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="my-2 bg-border/60" />

          <div className="space-y-1">
            <DropdownMenuItem asChild className="h-11 gap-2.5 rounded-lg px-2.5 text-sm md:h-10">
              <a href="https://help.openai.com" rel="noreferrer" target="_blank">
                <CircleHelp className="h-4 w-4 text-muted-foreground" />
                <span>Help</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="h-11 gap-2.5 rounded-lg px-2.5 text-sm text-destructive focus:bg-destructive/10 focus:text-destructive md:h-10"
              onSelect={(event) => {
                event.preventDefault();
                openSignOutConfirm();
              }}
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={handleSignOutConfirmOpenChange} open={signOutConfirm.open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out of Compass?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out on this browser and redirected to the login screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Form action="/workspaces" method="post">
              <input name="intent" type="hidden" value="logout" />
              <AlertDialogAction asChild>
                <Button type="submit" variant="destructive">
                  Log out
                </Button>
              </AlertDialogAction>
            </Form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AppSidebar({ auth, activeTenantSlug, buildSettingsHref }: AppSidebarProps) {
  const location = useLocation();
  const primaryTenantSlug = resolvePrimaryWorkspaceSlug(auth);
  const chatHref = primaryTenantSlug ? `/t/${primaryTenantSlug}/chat` : "/workspaces";

  const primaryItems: PrimaryNavItem[] = [
    {
      label: "Chat",
      to: chatHref,
      icon: MessageSquareText,
      active: /^\/t\/[^/]+\/chat(?:\/|$)/u.test(location.pathname)
    },
    {
      label: "Workspaces",
      to: "/workspaces",
      icon: FolderKanban,
      active: location.pathname.startsWith("/workspaces")
    }
  ];

  const workspaceItems = buildWorkspaceMenuItems(
    auth.memberships,
    activeTenantSlug,
    auth.lastActiveTenantSlug
  );

  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar">
      <SidebarHeader className="px-3 pb-2 pt-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <Link
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent px-2 py-2",
              "group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
              "text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
            to="/workspaces"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-primary/10 text-sidebar-primary">
              <Compass className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              Compass
            </span>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 pb-3">
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

        <SidebarGroup className="px-0 pt-1">
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
            Workspaces
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {workspaceItems.length === 0 ? (
              <p className="px-3 py-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
                No workspaces yet.
              </p>
            ) : (
              <SidebarMenu>
                {workspaceItems.map((item) => {
                  const href = resolveWorkspaceHref(location, item.tenantSlug);

                  return (
                    <SidebarMenuItem key={item.tenantId}>
                      <SidebarMenuButton
                        asChild
                        isActive={item.active}
                        size="sm"
                        tooltip={item.tenantName}
                      >
                        <Link
                          aria-current={item.active ? "page" : undefined}
                          aria-label={item.tenantName}
                          to={href}
                        >
                          <span
                            aria-hidden
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-sidebar-border bg-sidebar-accent/70 text-[10px] font-semibold text-sidebar-foreground"
                          >
                            {readWorkspaceMonogram(item.tenantName)}
                          </span>
                          <span className="truncate group-data-[collapsible=icon]:hidden">
                            {item.tenantName}
                          </span>
                          {item.active ? (
                            <Check className="ml-auto h-4 w-4 text-sidebar-primary group-data-[collapsible=icon]:hidden" />
                          ) : null}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
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
