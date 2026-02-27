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
  const loginRedirect = `/login?returnTo=${encodeURIComponent(buildReturnTo(request))}`;

  let result: Awaited<ReturnType<typeof getAuthMe>>;
  try {
    result = await getAuthMe(request);
  } catch {
    return redirect(loginRedirect);
  }

  if (result.status === 401 || result.status >= 500) {
    return redirect(loginRedirect);
  }

  if (!result.data) {
    const message = readApiErrorMessage(result.error, "Unable to load authenticated user context.");
    throw new Error(message);
  }

  const auth = parseAuthShellData(result.data);
  if (!auth) {
    return redirect(loginRedirect);
  }

  return auth;
}
