import type { SsoSessionPayload } from "../../auth/sso-cookie";

interface WorkspaceShellProps {
  session: SsoSessionPayload | null;
  devFallbackEnabled: boolean;
}

function displayName(session: SsoSessionPayload | null) {
  if (!session) {
    return "Local Development";
  }

  return session.name ?? session.email ?? session.sub;
}

function statusCopy(session: SsoSessionPayload | null, devFallbackEnabled: boolean) {
  if (session) {
    return "Enterprise SSO session is active.";
  }

  if (devFallbackEnabled) {
    return "Development fallback is enabled. Enterprise SSO is bypassed for local work.";
  }

  return "Enterprise SSO session is not active.";
}

export function WorkspaceShell({ session, devFallbackEnabled }: WorkspaceShellProps) {
  return (
    <main className="app-page">
      <section className="app-shell">
        <header className="app-header">
          <div>
            <p className="app-kicker">Compass</p>
            <h1>Core App Shell</h1>
            <p className="app-lead" data-testid="baseline-helper-copy">
              Foundation for authenticated product workflows. UI modules and feature surfaces will
              be added incrementally from this baseline.
            </p>
          </div>
          <div className="app-actions">
            <span className="app-badge">{displayName(session)}</span>
            {session ? (
              <form action="/api/auth/entra/logout" method="post">
                <button className="button secondary" type="submit">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </header>

        <section className="app-card">
          <h2>Authentication Status</h2>
          <p>{statusCopy(session, devFallbackEnabled)}</p>
        </section>

        <section className="app-card">
          <h2>Next Build Step</h2>
          <p>
            Add the first production workflow and route tree under this shell, keeping feature code
            colocated with its route boundary.
          </p>
        </section>
      </section>
    </main>
  );
}
