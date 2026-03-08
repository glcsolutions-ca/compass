import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  DEFAULT_OIDC_SCOPE,
  type OidcClient,
  type OidcIdTokenClaims,
  ApiError,
  asStringOrNull
} from "./auth-core.js";

export class EntraOidcClient implements OidcClient {
  private readonly authorityHost: string;
  private readonly tenantSegment: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly scope: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(input: {
    authorityHost: string;
    tenantSegment: string;
    clientId: string;
    clientSecret: string;
    scope?: string;
    jwksOptions?: Parameters<typeof createRemoteJWKSet>[1];
  }) {
    this.authorityHost = input.authorityHost.replace(/\/+$/u, "");
    this.tenantSegment = input.tenantSegment;
    this.clientId = input.clientId;
    this.clientSecret = input.clientSecret;
    this.scope = input.scope ?? DEFAULT_OIDC_SCOPE;

    const jwksUrl = new URL(`${this.authorityHost}/${this.tenantSegment}/discovery/v2.0/keys`);
    this.jwks = createRemoteJWKSet(jwksUrl, input.jwksOptions);
  }

  buildAuthorizeUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string {
    const url = new URL(`${this.authorityHost}/${this.tenantSegment}/oauth2/v2.0/authorize`);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", this.scope);
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  buildAdminConsentUrl(input: { tenantHint?: string; redirectUri: string; state: string }): string {
    const targetTenant = input.tenantHint?.trim() || this.tenantSegment;
    const url = new URL(`${this.authorityHost}/${targetTenant}/v2.0/adminconsent`);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  async exchangeCodeForIdToken(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<string> {
    const tokenUrl = new URL(`${this.authorityHost}/${this.tenantSegment}/oauth2/v2.0/token`);
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
      scope: this.scope
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    const payload = (await response.json().catch(() => null)) as {
      id_token?: unknown;
      error?: unknown;
      error_description?: unknown;
    } | null;

    if (!response.ok) {
      throw new ApiError(
        401,
        "OIDC_TOKEN_EXCHANGE_FAILED",
        asStringOrNull(payload?.error_description) ||
          asStringOrNull(payload?.error) ||
          `Token endpoint failed with ${response.status}`
      );
    }

    const idToken = asStringOrNull(payload?.id_token);
    if (!idToken) {
      throw new ApiError(
        401,
        "OIDC_TOKEN_EXCHANGE_FAILED",
        "Token endpoint did not return id_token"
      );
    }

    return idToken;
  }

  async verifyIdToken(input: {
    idToken: string;
    expectedNonce: string;
  }): Promise<OidcIdTokenClaims> {
    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
      ({ payload } = await jwtVerify(input.idToken, this.jwks, {
        audience: this.clientId,
        clockTolerance: 5
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "ID token validation failed";
      throw new ApiError(401, "OIDC_TOKEN_INVALID", message);
    }

    const tid = asStringOrNull(payload.tid);
    const oid = asStringOrNull(payload.oid);
    const iss = asStringOrNull(payload.iss);
    const nonce = asStringOrNull(payload.nonce);

    if (!tid || !oid || !iss || !nonce) {
      throw new ApiError(401, "OIDC_TOKEN_INVALID", "ID token missing required claims");
    }

    const expectedIssuer = `${this.authorityHost}/${tid}/v2.0`;
    if (iss !== expectedIssuer) {
      throw new ApiError(401, "OIDC_TOKEN_INVALID", "ID token issuer is invalid");
    }

    if (nonce !== input.expectedNonce) {
      throw new ApiError(401, "OIDC_TOKEN_INVALID", "ID token nonce mismatch");
    }

    return {
      tid,
      oid,
      iss,
      email: asStringOrNull(payload.email),
      upn: asStringOrNull(payload.preferred_username),
      name: asStringOrNull(payload.name)
    };
  }
}
