import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import HomeClient from "./home-client";
import { loadWebAuthRuntimeConfig } from "./auth/runtime-config";
import { parseSsoCookie, SSO_COOKIE_NAME } from "./auth/sso-cookie";

export default async function HomePage() {
  const config = loadWebAuthRuntimeConfig();

  if (!config.devFallbackEnabled && config.entraLoginEnabled) {
    if (!config.sessionSecret) {
      throw new Error("WEB_SESSION_SECRET is not configured");
    }

    const cookieStore = await cookies();
    const signedSsoCookie = cookieStore.get(SSO_COOKIE_NAME)?.value;
    const ssoSession = parseSsoCookie(signedSsoCookie, config.sessionSecret);
    if (!ssoSession) {
      redirect("/login?next=%2F");
    }
  }

  return <HomeClient />;
}
