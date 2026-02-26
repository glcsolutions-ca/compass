import { useLoaderData } from "react-router";
import type { LoginLoaderData } from "./loader";
import { loadLoginRouteData } from "./loader";
import { meta } from "./meta";
import { LoginView } from "./view";

export { meta };

export async function clientLoader(args: { request: Request }) {
  return loadLoginRouteData(args);
}

export default function PublicLoginRoute() {
  const data = useLoaderData<LoginLoaderData>();

  return (
    <LoginView
      adminConsentHref={data.adminConsentHref}
      showAdminConsentNotice={data.showAdminConsentNotice}
      showAdminConsentSuccess={data.showAdminConsentSuccess}
      signInHref={data.signInHref}
    />
  );
}
