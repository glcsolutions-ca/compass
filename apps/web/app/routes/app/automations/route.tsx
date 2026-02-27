import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import type { ShellRouteHandle } from "~/features/auth/types";

const AUTOMATION_PLACEHOLDERS = [
  {
    title: "Scheduled Runs",
    description: "Configure recurring jobs that execute prompts against your workspace context."
  },
  {
    title: "Inbox Notifications",
    description: "Open rich task updates when runs complete, fail, or require human review."
  },
  {
    title: "Run History",
    description: "Inspect run logs, timing, and output snapshots with deterministic replay."
  }
];

export const meta: MetaFunction = () => {
  return [{ title: "Compass Automations" }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  navLabel: "Automations"
};

export default function AutomationsRoute() {
  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-col gap-8"
      data-testid="automations-placeholder-page"
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Compass Utilities
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Automations</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Schedule repeatable background workflows for recurring reporting, QA checks, and
          operational tasks.
        </p>
      </header>

      <div className="grid gap-3">
        {AUTOMATION_PLACEHOLDERS.map((item) => (
          <article
            key={item.title}
            className="rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm"
          >
            <h2 className="text-sm font-semibold text-card-foreground">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled type="button">
          Create automation (coming soon)
        </Button>
        <Link
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
          to="/workspaces"
        >
          Manage workspace context
        </Link>
      </div>
    </section>
  );
}
