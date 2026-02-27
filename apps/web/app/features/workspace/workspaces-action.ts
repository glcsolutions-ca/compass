import { redirect } from "react-router";
import { acceptTenantInvite, createTenant, readApiErrorMessage } from "~/lib/api/compass-client";
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

    const result = await createTenant(request, parsed.data);

    if (result.status === 401) {
      return unauthorizedToLogin(request);
    }

    if (!result.data) {
      return {
        intent,
        error: readApiErrorMessage(result.error, "Unable to create workspace.")
      } satisfies WorkspacesActionData;
    }

    const payload = result.data as { tenant?: { slug?: unknown } };
    const tenantSlug =
      typeof payload.tenant?.slug === "string" && payload.tenant.slug.trim().length > 0
        ? payload.tenant.slug.trim()
        : parsed.data.slug;

    return redirect(`/workspaces?notice=created&workspace=${encodeURIComponent(tenantSlug)}`);
  }

  const parsed = AcceptInviteSchema.safeParse({
    tenantSlug: formData.get("tenantSlug"),
    inviteToken: formData.get("inviteToken")
  });

  if (!parsed.success) {
    return {
      intent,
      error: parsed.error.issues[0]?.message ?? "Invalid invite acceptance input."
    } satisfies WorkspacesActionData;
  }

  const result = await acceptTenantInvite(request, parsed.data);

  if (result.status === 401) {
    return unauthorizedToLogin(request);
  }

  if (!result.data) {
    return {
      intent,
      error: readApiErrorMessage(result.error, "Unable to accept invite.")
    } satisfies WorkspacesActionData;
  }

  const payload = result.data as { tenantSlug?: unknown };
  const tenantSlug =
    typeof payload.tenantSlug === "string" && payload.tenantSlug.trim().length > 0
      ? payload.tenantSlug.trim()
      : parsed.data.tenantSlug;

  return redirect(`/workspaces?notice=joined&workspace=${encodeURIComponent(tenantSlug)}`);
}
