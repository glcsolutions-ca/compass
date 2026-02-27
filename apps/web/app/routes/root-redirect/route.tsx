import { redirect } from "react-router";
import { parseAuthShellData, resolveAuthenticatedLandingPath } from "~/features/auth/auth-me";
import { getAuthMe } from "~/lib/api/compass-client";

export async function clientLoader({ request }: { request: Request }) {
  let result: Awaited<ReturnType<typeof getAuthMe>> | null;
  try {
    result = await getAuthMe(request);
  } catch {
    return redirect("/login");
  }

  if (result.status === 200 && result.data) {
    const auth = parseAuthShellData(result.data);
    if (auth) {
      return redirect(resolveAuthenticatedLandingPath(auth));
    }
  }

  return redirect("/login");
}

export default function RootRedirectRoute() {
  return null;
}
