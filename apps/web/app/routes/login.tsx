import type { MetaFunction } from "react-router";
import { useLocation } from "react-router";

export const meta: MetaFunction = () => {
  return [
    { title: "Compass Login" },
    { name: "description", content: "Sign in to Compass with Microsoft Entra ID" }
  ];
};

export function resolveReturnTo(candidate: string | null): string {
  if (!candidate) {
    return "/";
  }

  const trimmed = candidate.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/";
  }

  return trimmed;
}

export default function LoginRoute() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const returnTo = resolveReturnTo(query.get("returnTo") ?? query.get("next"));
  const signInHref = `/v1/auth/entra/start?returnTo=${encodeURIComponent(returnTo)}`;
  const error = query.get("error");
  const tenantHint = query.get("tenantHint")?.trim() || "";
  const adminConsentParams = new URLSearchParams({
    returnTo
  });
  if (tenantHint) {
    adminConsentParams.set("tenantHint", tenantHint);
  }
  const adminConsentHref = `/v1/auth/entra/admin-consent/start?${adminConsentParams.toString()}`;

  return (
    <main className="page" data-testid="login-page">
      <section className="panel">
        <p className="eyebrow">Compass</p>
        <h1>Sign in with Microsoft</h1>
        <p className="helper">
          Compass uses Microsoft Entra ID for authentication. You will be redirected to Microsoft to
          sign in.
        </p>

        <a className="button" href={signInHref} data-testid="sign-in-link">
          Sign in with Microsoft
        </a>

        {error === "admin_consent_required" ? (
          <section className="notice" data-testid="admin-consent-notice">
            <h2>Admin consent required</h2>
            <p className="helper">
              Your Microsoft 365 administrator needs to grant consent before users from your
              organization can sign in.
            </p>
            <a
              className="button secondary"
              href={adminConsentHref}
              data-testid="admin-consent-link"
            >
              Continue with admin consent
            </a>
          </section>
        ) : null}
      </section>
    </main>
  );
}
