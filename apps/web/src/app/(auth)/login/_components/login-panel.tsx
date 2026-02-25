import Link from "next/link";
import { EntraLoginAction } from "./entra-login-action";
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
          <p className="auth-meta">
            <span className="auth-badge">Single Sign-On</span>
            <span>Microsoft Entra</span>
          </p>
          <h2>Enterprise Access</h2>
          <p className="auth-note">Use your organization account to continue.</p>

          {model.errorMessage ? (
            <p className="auth-error" role="alert">
              {model.errorMessage}
            </p>
          ) : null}

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

          {setupErrorMessage ? (
            <p className="auth-error" role="alert">
              {setupErrorMessage}
            </p>
          ) : null}

          <div className="auth-divider" aria-hidden="true" />

          <EntraLoginAction href={ssoHref} disabled={!canUseSso} />
        </section>
      </section>
    </main>
  );
}
