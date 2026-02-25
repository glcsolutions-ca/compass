import { redirect } from "next/navigation";
import { resolveEntraRedirectUri } from "../../auth/entra-redirect-uri";
import { readEnterpriseAuthState } from "../../_lib/server/enterprise-session";
import { LoginPanel } from "./_components/login-panel";
import { createLoginPageModel } from "./_lib/login-page.model";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSetupErrorMessage(input: {
  entraLoginEnabled: boolean;
  sessionSecret: string | null;
  entraClientId: string | null;
  webBaseUrl: string | null;
}) {
  if (!input.entraLoginEnabled) {
    return null;
  }

  if (!input.sessionSecret) {
    return "WEB_SESSION_SECRET must be configured before enterprise sign-in can start.";
  }

  if (!input.entraClientId) {
    return "ENTRA_CLIENT_ID must be configured for enterprise sign-in.";
  }

  const redirectUriResolution = resolveEntraRedirectUri(input.webBaseUrl);
  if (!redirectUriResolution.redirectUri) {
    return redirectUriResolution.error;
  }

  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const model = createLoginPageModel(resolvedSearchParams);
  const { config, session } = await readEnterpriseAuthState();

  if (session) {
    redirect(model.nextPath);
  }

  return (
    <LoginPanel
      model={model}
      entraLoginEnabled={config.entraLoginEnabled}
      devFallbackEnabled={config.devFallbackEnabled}
      setupErrorMessage={readSetupErrorMessage(config)}
    />
  );
}
