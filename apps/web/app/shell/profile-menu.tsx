import { UserRound } from "lucide-react";
import { Form } from "react-router";
import type { AuthShellLoaderData } from "~/shell/shell-loader";
import { ThemeToggle } from "~/shell/theme-toggle";
import { WorkspaceSwitcher } from "~/shell/workspace-switcher";
import { Avatar, AvatarFallback } from "~/ui/shadcn/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "~/ui/shadcn/dropdown-menu";
import { Button } from "~/ui/shadcn/button";

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

export function ProfileMenu({
  auth,
  activeTenantSlug
}: {
  auth: AuthShellLoaderData;
  activeTenantSlug: string | null;
}) {
  const displayName =
    auth.user?.displayName?.trim() || auth.user?.primaryEmail?.trim() || "Compass User";
  const email = auth.user?.primaryEmail?.trim() || "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open profile menu"
          className="fixed bottom-4 right-4 h-12 w-12 rounded-full border border-border bg-card shadow-lg"
          size="icon"
          type="button"
          variant="outline"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs font-semibold">
              {readInitials(displayName)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" side="top">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{displayName}</span>
        </DropdownMenuLabel>
        {email.length > 0 ? <p className="px-2 text-xs text-muted-foreground">{email}</p> : null}

        <DropdownMenuSeparator />
        <div className="px-1 py-1">
          <ThemeToggle />
        </div>

        <DropdownMenuSeparator />
        <div className="px-1 py-1">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Workspaces
          </p>
          <WorkspaceSwitcher activeTenantSlug={activeTenantSlug} memberships={auth.memberships} />
        </div>

        <DropdownMenuSeparator />
        <Form method="post">
          <input name="intent" type="hidden" value="logout" />
          <Button className="w-full justify-start" type="submit" variant="ghost">
            Sign out
          </Button>
        </Form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
