import { CircleHelp, Clock3, ChevronsUpDown, LogOut, Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { Form, Link } from "react-router";
import { Avatar, AvatarFallback } from "@compass/ui/avatar";
import { Button } from "@compass/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@compass/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@compass/ui/dropdown-menu";
import { SidebarMenuButton } from "@compass/ui/sidebar";
import type { AuthShellLoaderData } from "~/features/auth/types";
import type { SettingsSection } from "~/features/settings/types";
import { readInitials } from "~/layout/app-sidebar-model";
import { cn } from "@compass/ui/cn";

interface SignOutConfirmState {
  open: boolean;
}

export function SidebarAccountMenu({
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
