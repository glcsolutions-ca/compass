import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "react-router";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import type { AuthShellLoaderData } from "~/features/auth/types";
import { AppSidebar } from "~/components/shell/app-sidebar";

const SIDEBAR_OPEN_STORAGE_KEY = "compass-sidebar-open";

function readActiveTenantSlug(pathname: string): string | null {
  const match = pathname.match(/^\/t\/([^/]+)/u);
  return match?.[1] ?? null;
}

function resolveInitialSidebarOpen(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  const persisted = window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
  if (persisted === "true") {
    return true;
  }

  if (persisted === "false") {
    return false;
  }

  return true;
}

function persistSidebarOpenState(open: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, open ? "true" : "false");
}

export function AppShell({ auth, children }: { auth: AuthShellLoaderData; children: ReactNode }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => resolveInitialSidebarOpen());
  const activeTenantSlug = useMemo(
    () => readActiveTenantSlug(location.pathname),
    [location.pathname]
  );

  return (
    <SidebarProvider
      className="min-h-screen"
      onOpenChange={(nextOpen) => {
        setSidebarOpen(nextOpen);
        persistSidebarOpenState(nextOpen);
      }}
      open={sidebarOpen}
      style={
        {
          "--sidebar-width": "17.25rem",
          "--sidebar-width-icon": "3.5rem"
        } as CSSProperties
      }
    >
      <AppSidebar activeTenantSlug={activeTenantSlug} auth={auth} />
      <div className="fixed left-[calc(var(--sidebar-width)_-_2.5rem)] top-5 z-30 hidden transition-[left] duration-200 ease-in-out md:flex md:peer-data-[state=collapsed]:left-[calc(var(--sidebar-width-icon)_+_0.5rem)]">
        <SidebarTrigger
          aria-label="Toggle navigation"
          className="h-8 w-8 border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        />
      </div>
      <SidebarInset className="shell-surface min-h-screen">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur md:hidden">
          <SidebarTrigger aria-label="Open navigation" className="h-8 w-8" />
          <span className="text-sm font-medium tracking-tight text-foreground">Compass</span>
        </header>
        <main className="relative flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export const __private__ = {
  SIDEBAR_OPEN_STORAGE_KEY,
  resolveInitialSidebarOpen,
  persistSidebarOpenState,
  readActiveTenantSlug
};
