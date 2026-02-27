import type { MetaFunction } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useOutletContext } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import type { AuthShellLoaderData, ShellRouteHandle } from "~/features/auth/types";
import {
  submitWorkspacesAction,
  type WorkspacesActionData
} from "~/features/workspace/workspaces-action";
import {
  loadWorkspacesData,
  type WorkspacesLoaderData
} from "~/features/workspace/workspaces-loader";

function BusyLabel({
  currentIntent,
  expectedIntent,
  idleLabel,
  busyLabel
}: {
  currentIntent: string | null;
  expectedIntent: string;
  idleLabel: string;
  busyLabel: string;
}) {
  return <>{currentIntent === expectedIntent ? busyLabel : idleLabel}</>;
}

export const meta: MetaFunction = () => {
  return [{ title: "Compass Workspaces" }];
};

export const handle: ShellRouteHandle = {
  requiresAuth: true,
  navLabel: "Workspaces"
};

export async function clientLoader({
  request
}: {
  request: Request;
}): Promise<WorkspacesLoaderData> {
  return loadWorkspacesData({ request });
}

export async function clientAction({
  request
}: {
  request: Request;
}): Promise<Response | WorkspacesActionData> {
  return submitWorkspacesAction({ request });
}

export default function WorkspacesRoute() {
  const loaderData = useLoaderData<WorkspacesLoaderData>();
  const actionData = useActionData<WorkspacesActionData>();
  const { auth } = useOutletContext<{ auth: AuthShellLoaderData }>();
  const navigation = useNavigation();
  const formIntent = (navigation.formData?.get("intent") as string | null) ?? null;

  return (
    <section className="mx-auto grid w-full max-w-3xl gap-6" data-testid="workspaces-page">
      <header className="grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Workspace Management
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Manage workspaces</h1>
        <p className="text-sm text-muted-foreground">
          Workspaces are optional for chat in this phase. Use this page to manage collaboration
          spaces for invites, roles, and shared operations.
        </p>
      </header>

      {loaderData.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loaderData.error}
        </div>
      ) : null}
      {loaderData.notice ? (
        <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {loaderData.notice === "created" ? "Workspace created" : "Workspace joined"}
          {loaderData.workspaceSlug ? `: ${loaderData.workspaceSlug}` : ""}.
        </div>
      ) : null}

      {auth.memberships.length > 0 ? (
        <ul
          className="grid gap-2 rounded-xl border border-border bg-card/80 p-4"
          data-testid="workspace-list"
        >
          {auth.memberships.map((membership) => (
            <li key={membership.tenantId}>
              <div className="flex items-center justify-between rounded-md border border-transparent px-3 py-2 text-sm">
                <span>{membership.tenantName}</span>
                <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  {membership.role}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          You have no workspace memberships yet. Chat is still available at `/chat`; create or join
          a workspace here when you need collaboration features.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Form className="grid gap-3 rounded-xl border border-border bg-card/80 p-4" method="post">
          <input name="intent" type="hidden" value="create" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Create Workspace
          </h2>
          <label className="grid gap-1 text-sm" htmlFor="create-workspace-slug">
            Slug
            <Input
              autoComplete="off"
              id="create-workspace-slug"
              name="slug"
              placeholder="acme"
              required
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="create-workspace-name">
            Name
            <Input
              autoComplete="organization"
              id="create-workspace-name"
              name="name"
              placeholder="Acme Corp"
              required
            />
          </label>
          <Button type="submit">
            <BusyLabel
              busyLabel="Creating..."
              currentIntent={formIntent}
              expectedIntent="create"
              idleLabel="Create workspace"
            />
          </Button>
          {actionData?.intent === "create" && actionData.error ? (
            <p className="text-sm text-destructive">{actionData.error}</p>
          ) : null}
        </Form>

        <Form className="grid gap-3 rounded-xl border border-border bg-card/80 p-4" method="post">
          <input name="intent" type="hidden" value="acceptInvite" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Accept Invite
          </h2>
          <label className="grid gap-1 text-sm" htmlFor="invite-tenant-slug">
            Tenant slug
            <Input
              autoComplete="off"
              id="invite-tenant-slug"
              name="tenantSlug"
              placeholder="acme"
              required
            />
          </label>
          <label className="grid gap-1 text-sm" htmlFor="invite-token">
            Invite token
            <Input
              autoComplete="off"
              id="invite-token"
              name="inviteToken"
              placeholder="Paste invite token"
              required
            />
          </label>
          <Button type="submit" variant="secondary">
            <BusyLabel
              busyLabel="Joining..."
              currentIntent={formIntent}
              expectedIntent="acceptInvite"
              idleLabel="Join workspace"
            />
          </Button>
          {actionData?.intent === "acceptInvite" && actionData.error ? (
            <p className="text-sm text-destructive">{actionData.error}</p>
          ) : null}
        </Form>
      </div>
    </section>
  );
}
