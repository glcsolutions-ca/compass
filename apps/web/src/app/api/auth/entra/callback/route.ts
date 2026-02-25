import { createLocalJWKSet, createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import type { JWTPayload, JSONWebKeySet } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveEntraRedirectUri } from "../../../../auth/entra-redirect-uri";
import { loadWebAuthRuntimeConfig } from "../../../../auth/runtime-config";
import {
  OIDC_STATE_COOKIE_NAME,
  clearOidcStateCookieHeader,
  createSignedSsoCookie,
  parseOidcStateCookie,
  ssoCookieHeader
} from "../../../../auth/sso-cookie";

const ENTRA_TOKEN_ENDPOINT = "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const ENTRA_JWKS_URI = "https://login.microsoftonline.com/common/discovery/v2.0/keys";
const entraRemoteJwks = createRemoteJWKSet(new URL(ENTRA_JWKS_URI));

export const dynamic = "force-dynamic";

function readStringClaim(payload: JWTPayload, claim: string) {
  const value = payload[claim];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function redirectToLogin(request: NextRequest, code: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url);
  response.headers.append("set-cookie", clearOidcStateCookieHeader());
  return response;
}

function readIdToken(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const idToken = (payload as Record<string, unknown>).id_token;
  return typeof idToken === "string" && idToken.length > 0 ? idToken : null;
}

async function verifyIdToken(input: {
  idToken: string;
  clientId: string;
  expectedNonce: string;
  localJwksJson: string | null;
}) {
  const decoded = decodeJwt(input.idToken);
  const tid = readStringClaim(decoded, "tid");
  if (!tid) {
    throw new Error("tid_missing");
  }

  const issuer = `https://login.microsoftonline.com/${tid}/v2.0`;
  type KeyResolver = Parameters<typeof jwtVerify>[1];
  let keySet: KeyResolver = entraRemoteJwks;
  if (input.localJwksJson) {
    const parsed = JSON.parse(input.localJwksJson) as JSONWebKeySet;
    const localJwks = createLocalJWKSet(parsed);
    keySet = (protectedHeader, token) => localJwks(protectedHeader, token);
  }

  const verified = await jwtVerify(input.idToken, keySet, {
    issuer,
    audience: input.clientId,
    algorithms: ["RS256"]
  });

  const nonce = readStringClaim(verified.payload, "nonce");
  if (!nonce || nonce !== input.expectedNonce) {
    throw new Error("nonce_invalid");
  }

  const sub = readStringClaim(verified.payload, "sub");
  if (!sub) {
    throw new Error("sub_missing");
  }

  const name = readStringClaim(verified.payload, "name") ?? undefined;
  const email =
    readStringClaim(verified.payload, "email") ??
    readStringClaim(verified.payload, "preferred_username") ??
    undefined;

  return {
    sub,
    tid,
    name,
    email
  };
}

export async function GET(request: NextRequest) {
  const config = loadWebAuthRuntimeConfig();

  if (!config.entraLoginEnabled) {
    return redirectToLogin(request, "entra_disabled");
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

  if (!config.entraClientId || !config.entraClientSecret) {
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

  const stateCookie = parseOidcStateCookie(
    request.cookies.get(OIDC_STATE_COOKIE_NAME)?.value,
    config.sessionSecret
  );
  if (!stateCookie) {
    return redirectToLogin(request, "state_missing");
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    console.warn(
      JSON.stringify({
        event: "entra_callback_failure",
        reason: "provider_error",
        providerError: error,
        correlationId: request.headers.get("x-correlation-id") ?? null
      })
    );
    return redirectToLogin(request, "provider_error");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state || state !== stateCookie.state) {
    return redirectToLogin(request, "state_mismatch");
  }

  const tokenResponse = await fetch(ENTRA_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: config.entraClientId,
      client_secret: config.entraClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri.toString(),
      code_verifier: stateCookie.codeVerifier,
      scope: "openid profile email offline_access"
    }).toString(),
    cache: "no-store"
  });

  if (!tokenResponse.ok) {
    console.warn(
      JSON.stringify({
        event: "entra_callback_failure",
        reason: "token_exchange_failed",
        status: tokenResponse.status,
        correlationId: request.headers.get("x-correlation-id") ?? null
      })
    );
    return redirectToLogin(request, "token_exchange_failed");
  }

  const tokenPayload = (await tokenResponse.json()) as unknown;
  const idToken = readIdToken(tokenPayload);
  if (!idToken) {
    return redirectToLogin(request, "id_token_missing");
  }

  let verified: { sub: string; tid: string; name?: string; email?: string };
  try {
    verified = await verifyIdToken({
      idToken,
      clientId: config.entraClientId,
      expectedNonce: stateCookie.nonce,
      localJwksJson: process.env.ENTRA_JWKS_JSON?.trim() ?? null
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "entra_callback_failure",
        reason: "id_token_invalid",
        errorClass: error instanceof Error ? error.message : "unknown",
        correlationId: request.headers.get("x-correlation-id") ?? null
      })
    );
    return redirectToLogin(request, "id_token_invalid");
  }

  if (
    config.entraAllowedTenantIds.length > 0 &&
    !config.entraAllowedTenantIds.includes(verified.tid)
  ) {
    console.warn(
      JSON.stringify({
        event: "entra_callback_failure",
        reason: "tenant_not_allowed",
        tenantId: verified.tid,
        correlationId: request.headers.get("x-correlation-id") ?? null
      })
    );
    return redirectToLogin(request, "tenant_not_allowed");
  }

  const ssoCookie = createSignedSsoCookie({
    sub: verified.sub,
    tid: verified.tid,
    name: verified.name,
    email: verified.email,
    secret: config.sessionSecret
  });

  console.info(
    JSON.stringify({
      event: "entra_callback_success",
      tenantId: verified.tid,
      correlationId: request.headers.get("x-correlation-id") ?? null
    })
  );

  const response = NextResponse.redirect(new URL(stateCookie.nextPath, request.url));
  response.headers.append("set-cookie", ssoCookieHeader(ssoCookie));
  response.headers.append("set-cookie", clearOidcStateCookieHeader());
  return response;
}
