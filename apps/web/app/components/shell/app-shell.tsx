import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useMatches, useNavigate } from "react-router";
import { AppSidebar } from "~/components/shell/app-sidebar";
import { SettingsModal } from "~/components/shell/settings-modal";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import type { AuthShellLoaderData, ShellRouteHandle } from "~/features/auth/types";
import {
  buildSettingsModalUrl,
  parseSettingsModalState
} from "~/features/settings/settings-modal-state";
import type { SettingsSection } from "~/features/settings/types";
import { cn } from "~/lib/utils/cn";

const SIDEBAR_OPEN_STORAGE_KEY = "compass-sidebar-open";

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
  const matches = useMatches();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => resolveInitialSidebarOpen());
  const settingsModal = useMemo(() => parseSettingsModalState(location), [location]);
  const shellLayout = useMemo<NonNullable<ShellRouteHandle["shellLayout"]>>(() => {
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const candidate = (matches[index]?.handle as ShellRouteHandle | undefined)?.shellLayout;
      if (candidate === "immersive" || candidate === "default") {
        return candidate;
      }
    }

    return "default";
  }, [matches]);

  const openSettingsSection = (section: SettingsSection) => {
    void navigate(buildSettingsModalUrl(location, { open: true, section }));
  };

  const closeSettingsModal = () => {
    void navigate(buildSettingsModalUrl(location, { open: false }), { replace: true });
  };

  const switchSettingsSection = (section: SettingsSection) => {
    void navigate(buildSettingsModalUrl(location, { open: true, section }), { replace: true });
  };

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
      <AppSidebar
        auth={auth}
        buildSettingsHref={(section) => buildSettingsModalUrl(location, { open: true, section })}
      />
      <SidebarInset
        className={cn(
          "min-h-screen",
          shellLayout === "immersive" ? "bg-background" : "shell-surface"
        )}
      >
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur md:hidden">
          <SidebarTrigger aria-label="Open navigation" className="h-8 w-8" />
          <span className="text-sm font-medium tracking-tight text-foreground">Compass</span>
        </header>
        <main
          data-testid="app-main"
          className={cn(
            "relative flex-1",
            shellLayout === "immersive"
              ? "flex min-h-0 w-full min-w-0 max-w-full overflow-x-hidden overflow-y-hidden"
              : "px-4 py-6 md:px-8 md:py-8"
          )}
        >
          {children}
        </main>
        <SettingsModal
          auth={auth}
          onOpenChange={(open) => {
            if (open) {
              openSettingsSection(settingsModal.section);
              return;
            }

            closeSettingsModal();
          }}
          onSectionChange={switchSettingsSection}
          open={settingsModal.isOpen}
          section={settingsModal.section}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

export const __private__ = {
  SIDEBAR_OPEN_STORAGE_KEY,
  resolveInitialSidebarOpen,
  persistSidebarOpenState
};
