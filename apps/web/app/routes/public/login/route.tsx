import type { MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { parseAuthShellData, resolveAuthenticatedLandingPath } from "~/features/auth/auth-me";
import { readLoginQuery } from "~/features/auth/login-query";
import { getAuthMe } from "~/lib/api/compass-client";
import { buildEntraStartHref } from "~/lib/auth/auth-session";
import { Button } from "~/components/ui/button";

export interface LoginLoaderData {
  signInHref: string;
  adminConsentHref: string;
  showAdminConsentNotice: boolean;
  showAdminConsentSuccess: boolean;
}

function isDesktopRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const desktopCandidate = (window as { compassDesktop?: unknown }).compassDesktop;
  if (!desktopCandidate || typeof desktopCandidate !== "object") {
    return false;
  }

  const runtime = desktopCandidate as { isDesktop?: () => boolean };
  return typeof runtime.isDesktop === "function" ? runtime.isDesktop() : false;
}

function withDesktopClientHint(href: string, desktopRuntime: boolean): string {
  if (!desktopRuntime) {
    return href;
  }

  const parsed = new URL(href, "https://compass.local");
  parsed.searchParams.set("client", "desktop");
  return `${parsed.pathname}${parsed.search}`;
}

export const meta: MetaFunction = () => {
  return [
    { title: "Compass Login" },
    { name: "description", content: "Sign in to Compass with Microsoft Entra ID" }
  ];
};

export async function clientLoader({
  request
}: {
  request: Request;
}): Promise<LoginLoaderData | Response> {
  const url = new URL(request.url);
  const query = readLoginQuery(url);

  const authResult = await getAuthMe(request);
  if (authResult.status === 200 && authResult.data) {
    const auth = parseAuthShellData(authResult.data);
    if (auth) {
      return redirect(resolveAuthenticatedLandingPath(auth));
    }
  }

  const adminConsentParams = new URLSearchParams({
    returnTo: query.returnTo
  });

  if (query.tenantHint.length > 0) {
    adminConsentParams.set("tenantHint", query.tenantHint);
  }

  return {
    signInHref: buildEntraStartHref(query.returnTo),
    adminConsentHref: `/v1/auth/entra/admin-consent/start?${adminConsentParams.toString()}`,
    showAdminConsentNotice: query.error === "admin_consent_required" || query.consent === "denied",
    showAdminConsentSuccess: query.consent === "granted"
  };
}

export default function LoginRoute() {
  const data = useLoaderData<LoginLoaderData>();
  const desktopRuntime = isDesktopRuntime();
  const signInHref = withDesktopClientHint(data.signInHref, desktopRuntime);
  const adminConsentHref = withDesktopClientHint(data.adminConsentHref, desktopRuntime);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4">
      <section className="w-full max-w-2xl rounded-2xl border border-border bg-card/80 p-8 shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Compass
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          Sign in with Microsoft
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Continue with Entra ID to launch directly into chat. Workspace management is available
          anytime after sign-in.
        </p>

        <div className="mt-8">
          <Button asChild className="h-11 px-6" data-testid="sign-in-link" size="lg">
            <a href={signInHref}>Sign in with Microsoft</a>
          </Button>
        </div>

        {data.showAdminConsentSuccess ? (
          <section
            className="mt-8 rounded-lg border border-border bg-muted/60 p-4"
            data-testid="admin-consent-success"
          >
            <h2 className="text-sm font-semibold">Admin consent granted</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Consent was granted successfully. Continue by signing in.
            </p>
          </section>
        ) : null}

        {data.showAdminConsentNotice ? (
          <section
            className="mt-4 rounded-lg border border-border bg-muted/60 p-4"
            data-testid="admin-consent-notice"
          >
            <h2 className="text-sm font-semibold">Admin consent required</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A Microsoft 365 admin must grant tenant consent before users can sign in.
            </p>
            <Button asChild className="mt-4" variant="outline">
              <a data-testid="admin-consent-link" href={adminConsentHref}>
                Continue with admin consent
              </a>
            </Button>
          </section>
        ) : null}
      </section>
    </main>
  );
}
