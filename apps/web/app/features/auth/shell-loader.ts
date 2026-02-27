import { redirect } from "react-router";
import { parseAuthShellData } from "~/features/auth/auth-me";
import type { AuthShellLoaderData } from "~/features/auth/types";
import { getAuthMe, readApiErrorMessage } from "~/lib/api/compass-client";
import { buildReturnTo } from "~/lib/auth/auth-session";

export async function loadAuthShellData({
  request
}: {
  request: Request;
}): Promise<AuthShellLoaderData | Response> {
  const result = await getAuthMe(request);

  if (result.status === 401) {
    return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
  }

  if (!result.data) {
    const message = readApiErrorMessage(result.error, "Unable to load authenticated user context.");
    throw new Error(message);
  }

  const auth = parseAuthShellData(result.data);
  if (!auth) {
    return redirect(`/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`);
  }

  return auth;
}
