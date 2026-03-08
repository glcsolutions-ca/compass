import { redirect } from "react-router";
import { parseAuthShellData, resolveAuthenticatedLandingPath } from "~/features/auth/auth-me";
import { getAuthMe } from "~/lib/api/compass-client";

export async function clientLoader({ request }: { request: Request }) {
  const result = await getAuthMe(request);

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
