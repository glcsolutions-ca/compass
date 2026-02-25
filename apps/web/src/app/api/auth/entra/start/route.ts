import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveEntraRedirectUri } from "../../../../auth/entra-redirect-uri";
import { loadWebAuthRuntimeConfig } from "../../../../auth/runtime-config";
import {
  createOidcStateCookieValue,
  oidcStateCookieHeader,
  randomToken
} from "../../../../auth/sso-cookie";

const ENTRA_AUTHORIZATION_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize";

export const dynamic = "force-dynamic";

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

function pkceCodeChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export async function GET(request: NextRequest) {
  const config = loadWebAuthRuntimeConfig();

  if (!config.entraLoginEnabled) {
    return Response.json(
      {
        error: "Microsoft Entra login is disabled",
        code: "ENTRA_LOGIN_DISABLED"
      },
      {
        status: 404
      }
    );
  }

  if (!config.sessionSecret) {
    return Response.json(
      {
        error: "WEB_SESSION_SECRET is not configured",
        code: "SESSION_SECRET_REQUIRED"
      },
      {
        status: 500
      }
    );
  }

  if (!config.entraClientId) {
    return Response.json(
      {
        error: "Entra login settings are incomplete",
        code: "ENTRA_CONFIG_REQUIRED"
      },
      {
        status: 500
      }
    );
  }

  const redirectUriResolution = resolveEntraRedirectUri(config.webBaseUrl);
  if (!redirectUriResolution.redirectUri) {
    return Response.json(
      {
        error: redirectUriResolution.error,
        code: redirectUriResolution.code
      },
      {
        status: 500
      }
    );
  }
  const redirectUri = redirectUriResolution.redirectUri;

  const state = randomToken(24);
  const nonce = randomToken(24);
  const codeVerifier = randomToken(48);
  const nextPath = normalizeNextPath(request.nextUrl.searchParams.get("next"));

  const oidcStateCookie = createOidcStateCookieValue({
    state,
    nonce,
    codeVerifier,
    nextPath,
    secret: config.sessionSecret
  });

  const authorizeUrl = new URL(ENTRA_AUTHORIZATION_ENDPOINT);
  authorizeUrl.searchParams.set("client_id", config.entraClientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri.toString());
  authorizeUrl.searchParams.set("response_mode", "query");
  authorizeUrl.searchParams.set("scope", "openid profile email offline_access");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("nonce", nonce);
  authorizeUrl.searchParams.set("code_challenge", pkceCodeChallenge(codeVerifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  console.info(
    JSON.stringify({
      event: "entra_login_start",
      tenant: "organizations",
      correlationId: request.headers.get("x-correlation-id") ?? null
    })
  );

  const response = NextResponse.redirect(authorizeUrl);
  response.headers.append("set-cookie", oidcStateCookieHeader(oidcStateCookie));
  return response;
}
