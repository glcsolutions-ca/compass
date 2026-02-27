import { useEffect, useRef } from "react";
import { Clock3, Cog, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { AuthShellLoaderData } from "~/features/auth/types";
import type { SettingsSection } from "~/features/settings/types";
import { cn } from "~/lib/utils/cn";
import { ThemeControls } from "~/components/shell/theme-controls";
import { RuntimeAccountControls } from "~/components/shell/runtime-account-controls";

export interface SettingsModalProps {
  auth: AuthShellLoaderData;
  open: boolean;
  section: SettingsSection;
  onOpenChange: (open: boolean) => void;
  onSectionChange: (section: SettingsSection) => void;
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

function resolveDisplayName(auth: AuthShellLoaderData): string {
  return auth.user?.displayName?.trim() || auth.user?.primaryEmail?.trim() || "Compass User";
}

function resolveUsername(auth: AuthShellLoaderData): string {
  const email = auth.user?.primaryEmail?.trim();
  if (email) {
    return `@${email.split("@")[0]}`;
  }

  const displayName = resolveDisplayName(auth).toLowerCase().replace(/\s+/gu, "");
  return `@${displayName}`;
}

function PersonalizationPlaceholderCard({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-xl border border-border/70 bg-card/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-card-foreground">{title}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="inline-flex rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
          Coming soon
        </span>
      </div>
    </article>
  );
}

export function SettingsModal({
  auth,
  open,
  section,
  onOpenChange,
  onSectionChange
}: SettingsModalProps) {
  const displayName = resolveDisplayName(auth);
  const username = resolveUsername(auth);
  const lastRequestedSectionRef = useRef<SettingsSection>(section);

  useEffect(() => {
    lastRequestedSectionRef.current = section;
  }, [section]);

  const requestSectionChange = (nextSection: SettingsSection) => {
    if (nextSection === section || nextSection === lastRequestedSectionRef.current) {
      return;
    }

    lastRequestedSectionRef.current = nextSection;
    onSectionChange(nextSection);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[88vh] max-h-[88vh] w-[min(92vw,860px)] max-w-[860px] overflow-hidden p-0",
          "border-border/75 bg-card/95 text-card-foreground supports-[backdrop-filter]:bg-card/88",
          "shadow-[0_36px_96px_-40px_hsl(var(--foreground)/0.55),0_20px_42px_-28px_hsl(var(--foreground)/0.35)]"
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage account settings and personalization.</DialogDescription>
        </DialogHeader>

        <Tabs
          className="flex h-full flex-col md:flex-row"
          onValueChange={(value: string) => {
            if (value === "general" || value === "personalization") {
              requestSectionChange(value);
            }
          }}
          orientation="vertical"
          value={section}
        >
          <aside className="border-b border-border/70 bg-muted/25 md:w-64 md:border-b-0 md:border-r">
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/70 p-3">
                <Avatar className="h-9 w-9 rounded-md">
                  <AvatarFallback className="rounded-md bg-primary/15 text-xs font-semibold text-primary">
                    {readInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold tracking-tight text-foreground">
                    {displayName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{username}</p>
                </div>
              </div>

              <div className="space-y-1">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Preferences
                </h2>
                <p className="text-sm text-muted-foreground">Adjust your Compass experience.</p>
              </div>

              <TabsList className="grid w-full gap-1.5 rounded-xl bg-transparent p-0">
                <TabsTrigger
                  className={cn(
                    "h-11 justify-start gap-2 rounded-lg border border-transparent px-3 text-sm",
                    "data-[state=active]:border-border/80 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  )}
                  onClick={() => {
                    requestSectionChange("general");
                  }}
                  value="general"
                >
                  <Cog className="h-4 w-4" />
                  <span>General</span>
                </TabsTrigger>
                <TabsTrigger
                  className={cn(
                    "h-11 justify-start gap-2 rounded-lg border border-transparent px-3 text-sm",
                    "data-[state=active]:border-border/80 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  )}
                  onClick={() => {
                    requestSectionChange("personalization");
                  }}
                  value="personalization"
                >
                  <Clock3 className="h-4 w-4" />
                  <span>Personalization</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </aside>

          <section className="flex-1 overflow-hidden">
            <TabsContent className="h-full overflow-y-auto p-5 md:p-6" value="general">
              <div className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">General</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure appearance and app defaults.
                  </p>
                </div>
                <ThemeControls />
                <RuntimeAccountControls />
              </div>
            </TabsContent>

            <TabsContent className="h-full overflow-y-auto p-5 md:p-6" value="personalization">
              <div className="space-y-6">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    Personalization
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-foreground">
                    Personalization
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Personalization controls are staged next. This section is ready for rollout.
                  </p>
                </div>

                <div className="grid gap-3">
                  <PersonalizationPlaceholderCard
                    description="Tailor how Compass remembers project context and defaults."
                    title="Memory"
                  />
                  <PersonalizationPlaceholderCard
                    description="Set reusable guidance and preferred response style for your account."
                    title="Custom instructions"
                  />
                  <PersonalizationPlaceholderCard
                    description="Create lightweight behavior presets for different workstreams."
                    title="Behavior profiles"
                  />
                </div>
              </div>
            </TabsContent>
          </section>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
