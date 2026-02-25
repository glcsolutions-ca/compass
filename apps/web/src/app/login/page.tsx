import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadWebAuthRuntimeConfig } from "../auth/runtime-config";
import { parseSsoCookie, SSO_COOKIE_NAME } from "../auth/sso-cookie";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readQueryValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const value = searchParams[key];
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? null;
  }

  return null;
}

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

function renderErrorMessage(errorCode: string | null) {
  if (!errorCode) {
    return null;
  }

  if (errorCode === "tenant_not_allowed") {
    return "Your Entra tenant is not approved for access.";
  }

  if (errorCode === "provider_error") {
    return "Microsoft login was canceled or denied.";
  }

  return "Sign-in failed. Try again.";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const nextPath = normalizeNextPath(readQueryValue(resolvedSearchParams, "next"));
  const errorCode = readQueryValue(resolvedSearchParams, "error");

  const config = loadWebAuthRuntimeConfig();
  if (config.sessionSecret) {
    const cookieStore = await cookies();
    const signedSession = cookieStore.get(SSO_COOKIE_NAME)?.value;
    const ssoSession = parseSsoCookie(signedSession, config.sessionSecret);
    if (ssoSession) {
      redirect(nextPath);
    }
  }

  const errorMessage = renderErrorMessage(errorCode);

  return (
    <main>
      <h1>Compass Sign In</h1>
      <p className="helper">Enterprise SSO is required before provider authentication.</p>

      {errorMessage ? <p className="helper error">{errorMessage}</p> : null}

      {!config.entraLoginEnabled ? (
        <section className="panel">
          <h2>Microsoft Entra Login Disabled</h2>
          {config.devFallbackEnabled ? (
            <p className="helper">
              Dev fallback is enabled. Continue to the <Link href="/">workspace</Link>.
            </p>
          ) : (
            <p className="helper">Contact an administrator to enable enterprise SSO.</p>
          )}
        </section>
      ) : (
        <section className="panel">
          <h2>Enterprise Login</h2>
          <a
            data-testid="entra-login-link"
            href={`/api/auth/entra/start?next=${encodeURIComponent(nextPath)}`}
          >
            Sign in with Microsoft
          </a>
        </section>
      )}
    </main>
  );
}
