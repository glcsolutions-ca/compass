import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import type { ShellRouteHandle } from "~/features/auth/types";

const SKILL_PLACEHOLDERS = [
  {
    title: "Reusable Skill Packs",
    description: "Bundle prompts, constraints, and tool guidance into reusable execution modules."
  },
  {
    title: "Team Skill Library",
    description: "Publish and share curated skills that keep workflows consistent across operators."
  },
  {
    title: "Versioned Skill Profiles",
    description: "Track changes over time with explicit versions and predictable rollout behavior."
  }
];

export const meta: MetaFunction = () => {
  return [{ title: "Compass Skills" }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  navLabel: "Skills"
};

export default function SkillsRoute() {
  return (
    <section
      className="mx-auto flex w-full max-w-4xl flex-col gap-8"
      data-testid="skills-placeholder-page"
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Compass Utilities
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Skills</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Build reusable instruction packs for specialized workflows so teams can run consistent
          playbooks with less manual setup.
        </p>
      </header>

      <div className="grid gap-3">
        {SKILL_PLACEHOLDERS.map((item) => (
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
          Create skill (coming soon)
        </Button>
        <Link
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
          to="/workspaces"
        >
          Manage workspaces
        </Link>
      </div>
    </section>
  );
}
