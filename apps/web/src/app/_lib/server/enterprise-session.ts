import { cookies } from "next/headers";
import { loadWebAuthRuntimeConfig, type WebAuthRuntimeConfig } from "../../auth/runtime-config";
import { parseSsoCookie, type SsoSessionPayload, SSO_COOKIE_NAME } from "../../auth/sso-cookie";

export interface EnterpriseAuthState {
  config: WebAuthRuntimeConfig;
  session: SsoSessionPayload | null;
}

export async function readEnterpriseAuthState(): Promise<EnterpriseAuthState> {
  const config = loadWebAuthRuntimeConfig();
  if (!config.sessionSecret) {
    return {
      config,
      session: null
    };
  }

  const cookieStore = await cookies();
  const signedSsoCookie = cookieStore.get(SSO_COOKIE_NAME)?.value;

  return {
    config,
    session: parseSsoCookie(signedSsoCookie, config.sessionSecret)
  };
}
