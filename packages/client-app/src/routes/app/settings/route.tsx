import type { MetaFunction } from "react-router";
import { Link, useOutletContext, useParams } from "react-router";
import type { AuthShellLoaderData, ShellRouteHandle } from "~/features/auth/types";
import { resolveNewThreadTarget } from "~/lib/routes/chat-routes";
import { buildSettingsHref, resolveSettingsSection } from "~/lib/routes/settings-routes";
import { Button } from "@compass/ui/button";
import type { SettingsSection } from "~/features/settings/types";

const SETTINGS_SECTIONS: Array<{
  key: SettingsSection;
  title: string;
  description: string;
}> = [
  {
    key: "general",
    title: "General preferences",
    description:
      "Manage default behavior, navigation preferences, and account-level product settings."
  },
  {
    key: "personalization",
    title: "Personalization",
    description:
      "Adjust theme, layout, and personal defaults without leaving the workspace context."
  }
];

function resolveChatReturnTarget(auth: AuthShellLoaderData): string {
  const workspaceSlug =
    auth.activeWorkspaceSlug?.trim() ||
    auth.personalWorkspaceSlug?.trim() ||
    auth.workspaces.find((workspace) => workspace.status === "active")?.slug?.trim() ||
    "";

  return workspaceSlug ? resolveNewThreadTarget(workspaceSlug) : "/workspaces";
}

export const meta: MetaFunction = () => {
  return [{ title: "Compass Settings" }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  navLabel: "Settings"
};

export default function SettingsRoute() {
  const params = useParams();
  const { auth } = useOutletContext<{ auth: AuthShellLoaderData }>();
  const section = resolveSettingsSection(params.section);
  const chatHref = resolveChatReturnTarget(auth);

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8" data-testid="settings-page">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Account Settings
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Settings now use a dedicated account route so links stay clean, short, and predictable.
        </p>
      </header>

      <div className="grid gap-3">
        {SETTINGS_SECTIONS.map((item) => (
          <article
            key={item.key}
            className="rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm"
            data-active={item.key === section ? "true" : "false"}
          >
            <h2 className="text-sm font-semibold text-card-foreground">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            <Link
              className="mt-3 inline-flex text-sm font-medium text-muted-foreground hover:text-foreground"
              to={buildSettingsHref(item.key)}
            >
              Open {item.title}
            </Link>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild type="button">
          <Link to={chatHref}>Return to chat</Link>
        </Button>
      </div>
    </section>
  );
}
