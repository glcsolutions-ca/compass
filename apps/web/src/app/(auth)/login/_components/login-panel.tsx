import Link from "next/link";
import type { LoginPageModel } from "../_lib/login-page.model";

interface LoginPanelProps {
  model: LoginPageModel;
  entraLoginEnabled: boolean;
  devFallbackEnabled: boolean;
  setupErrorMessage: string | null;
}

export function LoginPanel({
  model,
  entraLoginEnabled,
  devFallbackEnabled,
  setupErrorMessage
}: LoginPanelProps) {
  const ssoHref = `/api/auth/entra/start?next=${encodeURIComponent(model.nextPath)}`;
  const canUseSso = entraLoginEnabled && !setupErrorMessage;

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <aside className="auth-hero">
          <p className="auth-kicker">Compass</p>
          <h1>Sign In</h1>
          <p>
            Compass uses enterprise identity by default. Start with Microsoft Entra single sign-on
            to continue.
          </p>
        </aside>

        <section className="auth-panel">
          <h2>Enterprise Access</h2>
          <p className="auth-note">Use your organization account to continue.</p>

          {model.errorMessage ? <p className="auth-error">{model.errorMessage}</p> : null}

          {!entraLoginEnabled ? (
            <p className="auth-note">
              Microsoft Entra login is currently disabled.{" "}
              {devFallbackEnabled ? (
                <>
                  Development fallback is active. Continue to the <Link href="/">app shell</Link>.
                </>
              ) : (
                "Contact an administrator to enable enterprise sign-in."
              )}
            </p>
          ) : null}

          {setupErrorMessage ? <p className="auth-error">{setupErrorMessage}</p> : null}

          <a
            className={`auth-action${canUseSso ? "" : " disabled"}`}
            data-testid="entra-login-link"
            href={canUseSso ? ssoHref : undefined}
            aria-disabled={!canUseSso}
          >
            Continue with Microsoft Entra
          </a>
        </section>
      </section>
    </main>
  );
}
