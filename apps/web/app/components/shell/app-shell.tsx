import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { AppSidebar } from "~/components/shell/app-sidebar";
import { SettingsModal } from "~/components/shell/settings-modal";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "~/components/ui/sidebar";
import type { AuthShellLoaderData } from "~/features/auth/types";
import {
  buildSettingsModalUrl,
  parseSettingsModalState
} from "~/features/settings/settings-modal-state";
import type { SettingsSection } from "~/features/settings/types";

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
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => resolveInitialSidebarOpen());
  const activeTenantSlug = useMemo(
    () => readActiveTenantSlug(location.pathname),
    [location.pathname]
  );
  const settingsModal = useMemo(() => parseSettingsModalState(location), [location]);

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
        activeTenantSlug={activeTenantSlug}
        auth={auth}
        buildSettingsHref={(section) => buildSettingsModalUrl(location, { open: true, section })}
      />
      <SidebarInset className="shell-surface min-h-screen">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur md:hidden">
          <SidebarTrigger aria-label="Open navigation" className="h-8 w-8" />
          <span className="text-sm font-medium tracking-tight text-foreground">Compass</span>
        </header>
        <main className="relative flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
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
  persistSidebarOpenState,
  readActiveTenantSlug
};
