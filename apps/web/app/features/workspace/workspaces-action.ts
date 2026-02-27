import { redirect } from "react-router";
import {
  acceptWorkspaceInvite,
  createWorkspace,
  readApiErrorMessage
} from "~/lib/api/compass-client";
import { buildReturnTo, logoutAndRedirect } from "~/lib/auth/auth-session";
import {
  AcceptInviteSchema,
  CreateWorkspaceSchema,
  WorkspacesIntentSchema,
  type WorkspacesIntent
} from "~/features/workspace/workspaces-schema";

export interface WorkspacesActionData {
  intent: WorkspacesIntent | null;
  error: string | null;
}

function readIntent(formData: FormData): WorkspacesIntent | null {
  const parsed = WorkspacesIntentSchema.safeParse(formData.get("intent"));
  return parsed.success ? parsed.data : null;
}

function unauthorizedToLogin(request: Request): Response {
  return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
}

export async function submitWorkspacesAction({
  request
}: {
  request: Request;
}): Promise<Response | WorkspacesActionData> {
  const formData = await request.formData();
  const intent = readIntent(formData);

  if (!intent) {
    return {
      intent: null,
      error: "Invalid form intent."
    } satisfies WorkspacesActionData;
  }

  if (intent === "logout") {
    return logoutAndRedirect(request);
  }

  if (intent === "create") {
    const parsed = CreateWorkspaceSchema.safeParse({
      slug: formData.get("slug"),
      name: formData.get("name")
    });

    if (!parsed.success) {
      return {
        intent,
        error: parsed.error.issues[0]?.message ?? "Invalid create workspace input."
      } satisfies WorkspacesActionData;
    }

    const result = await createWorkspace(request, parsed.data);

    if (result.status === 401) {
      return unauthorizedToLogin(request);
    }

    if (!result.data) {
      return {
        intent,
        error: readApiErrorMessage(result.error, "Unable to create workspace.")
      } satisfies WorkspacesActionData;
    }

    const payload = result.data as { workspace?: { slug?: unknown } };
    const workspaceSlug =
      typeof payload.workspace?.slug === "string" && payload.workspace.slug.trim().length > 0
        ? payload.workspace.slug.trim()
        : parsed.data.slug;

    return redirect(`/workspaces?notice=created&workspace=${encodeURIComponent(workspaceSlug)}`);
  }

  const parsed = AcceptInviteSchema.safeParse({
    workspaceSlug: formData.get("workspaceSlug"),
    inviteToken: formData.get("inviteToken")
  });

  if (!parsed.success) {
    return {
      intent,
      error: parsed.error.issues[0]?.message ?? "Invalid invite acceptance input."
    } satisfies WorkspacesActionData;
  }

  const result = await acceptWorkspaceInvite(request, parsed.data);

  if (result.status === 401) {
    return unauthorizedToLogin(request);
  }

  if (!result.data) {
    return {
      intent,
      error: readApiErrorMessage(result.error, "Unable to accept invite.")
    } satisfies WorkspacesActionData;
  }

  const payload = result.data as { workspaceSlug?: unknown };
  const workspaceSlug =
    typeof payload.workspaceSlug === "string" && payload.workspaceSlug.trim().length > 0
      ? payload.workspaceSlug.trim()
      : parsed.data.workspaceSlug;

  return redirect(`/workspaces?notice=joined&workspace=${encodeURIComponent(workspaceSlug)}`);
}
