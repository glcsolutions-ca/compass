import {
  Boxes,
  CircleHelp,
  ChevronsUpDown,
  Clock3,
  Compass,
  FolderKanban,
  LogOut,
  MessageSquareText,
  PanelLeft,
  SquarePen,
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
  SidebarSeparator,
  SidebarTrigger,
  useSidebar
} from "~/components/ui/sidebar";
import type { AuthShellLoaderData } from "~/features/auth/types";
import { buildNewThreadHref } from "~/features/chat/new-thread-routing";
import type { SettingsSection } from "~/features/settings/types";
import { cn } from "~/lib/utils/cn";

export interface AppSidebarProps {
  auth: AuthShellLoaderData;
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

interface UtilityNavItem {
  label: string;
  to: string;
  icon: typeof MessageSquareText;
  active: boolean;
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

function SidebarBrandControl() {
  const { state, toggleSidebar } = useSidebar();

  if (state === "collapsed") {
    return (
      <button
        aria-label="Expand sidebar"
        className={cn(
          "group/brand relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-primary/10 text-sidebar-primary",
          "transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        )}
        onClick={toggleSidebar}
        title="Expand sidebar"
        type="button"
      >
        <Compass
          className={cn(
            "h-4 w-4 transition-[opacity,transform] duration-200 ease-out",
            "opacity-100 scale-100",
            "group-hover/brand:opacity-0 group-hover/brand:scale-90",
            "group-focus-visible/brand:opacity-0 group-focus-visible/brand:scale-90"
          )}
        />
        <PanelLeft
          className={cn(
            "absolute h-4 w-4 transition-[opacity,transform] duration-200 ease-out",
            "opacity-0 scale-75 translate-x-0.5",
            "group-hover/brand:translate-x-0 group-hover/brand:opacity-100 group-hover/brand:scale-100",
            "group-focus-visible/brand:translate-x-0 group-focus-visible/brand:opacity-100 group-focus-visible/brand:scale-100"
          )}
        />
        <span className="sr-only">Expand sidebar</span>
      </button>
    );
  }

  return (
    <Link
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent px-2 py-2",
        "text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
      to="/chat"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-primary/10 text-sidebar-primary">
        <Compass className="h-4 w-4" />
      </span>
      <span className="truncate text-sm font-semibold tracking-tight">Compass</span>
    </Link>
  );
}

function SidebarCollapseControl() {
  const { state } = useSidebar();

  if (state !== "expanded") {
    return null;
  }

  return (
    <SidebarTrigger
      aria-label="Collapse sidebar"
      className={cn(
        "hidden h-8 w-8 shrink-0 border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:inline-flex"
      )}
    />
  );
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
          className={cn(
            "relative z-[60] w-[19rem] rounded-2xl border border-border/75 bg-card p-2.5 text-card-foreground",
            "shadow-[0_16px_36px_-16px_hsl(var(--foreground)/0.28),0_8px_18px_-12px_hsl(var(--foreground)/0.18)]"
          )}
          collisionPadding={12}
          side="top"
          sideOffset={8}
        >
          <DropdownMenuLabel className="rounded-xl px-2.5 py-2.5">
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

          <DropdownMenuSeparator className="my-2.5 bg-border/55" />

          <div className="space-y-1">
            <DropdownMenuItem
              asChild
              className="h-10 gap-3 rounded-lg px-2.5 text-[15px] font-medium leading-none"
            >
              <Link to={buildSettingsHref("personalization")}>
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                <span>Personalization</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              asChild
              className="h-10 gap-3 rounded-lg px-2.5 text-[15px] font-medium leading-none"
            >
              <Link to={buildSettingsHref("general")}>
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator className="my-2.5 bg-border/55" />

          <div className="space-y-1">
            <DropdownMenuItem
              asChild
              className="h-10 gap-3 rounded-lg px-2.5 text-[15px] font-medium leading-none"
            >
              <a href="https://help.openai.com" rel="noreferrer" target="_blank">
                <CircleHelp className="h-4 w-4 text-muted-foreground" />
                <span>Help</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={cn(
                "h-10 gap-3 rounded-lg px-2.5 text-[15px] font-medium leading-none text-destructive",
                "focus:bg-destructive/10 focus:text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive"
              )}
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

export function AppSidebar({ auth, buildSettingsHref }: AppSidebarProps) {
  const location = useLocation();
  const newThreadHref = buildNewThreadHref();

  const utilityItems: UtilityNavItem[] = [
    {
      label: "New thread",
      to: newThreadHref,
      icon: SquarePen,
      active: false
    },
    {
      label: "Automations",
      to: "/automations",
      icon: Clock3,
      active: location.pathname.startsWith("/automations")
    },
    {
      label: "Skills",
      to: "/skills",
      icon: Boxes,
      active: location.pathname.startsWith("/skills")
    }
  ];

  const primaryItems: PrimaryNavItem[] = [
    {
      label: "Chat",
      to: "/chat",
      icon: MessageSquareText,
      active: location.pathname === "/chat"
    },
    {
      label: "Workspaces",
      to: "/workspaces",
      icon: FolderKanban,
      active: location.pathname.startsWith("/workspaces")
    }
  ];

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
