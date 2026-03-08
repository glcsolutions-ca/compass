import { Compass, PanelLeft } from "lucide-react";
import { Link } from "react-router";
import { SidebarTrigger, useSidebar } from "@compass/ui/sidebar";
import { cn } from "@compass/ui/cn";

export function SidebarBrandControl() {
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

export function SidebarCollapseControl() {
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
