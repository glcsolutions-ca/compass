import { Button } from "~/ui/shadcn/button";

export interface LoginViewProps {
  signInHref: string;
  adminConsentHref: string;
  showAdminConsentNotice: boolean;
  showAdminConsentSuccess: boolean;
}

export function LoginView({
  signInHref,
  adminConsentHref,
  showAdminConsentNotice,
  showAdminConsentSuccess
}: LoginViewProps) {
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
          Continue with Entra ID to access your workspace and chat context.
        </p>

        <div className="mt-8">
          <Button asChild className="h-11 px-6" data-testid="sign-in-link" size="lg">
            <a href={signInHref}>Sign in with Microsoft</a>
          </Button>
        </div>

        {showAdminConsentSuccess ? (
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

        {showAdminConsentNotice ? (
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
