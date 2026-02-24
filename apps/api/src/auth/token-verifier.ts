import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { invalidToken, permissionDenied, tokenUnclassified } from "./errors.js";
import type { ScimTokenContext, VerifiedAccessToken } from "./types.js";
import type { ApiConfig } from "../config/index.js";

function parseBearerToken(header: string | undefined) {
  if (!header) {
    throw invalidToken("Missing Authorization header");
  }

  const match = header.match(/^Bearer\s+(.+)$/iu);
  if (!match) {
    throw invalidToken("Authorization header must be a Bearer token");
  }

  const token = match[1];
  if (!token) {
    throw invalidToken("Authorization header must include a token");
  }

  return token;
}

function claimAsString(payload: JWTPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseScopes(payload: JWTPayload) {
  const scopeString = claimAsString(payload, "scp");
  if (!scopeString) {
    return new Set<string>();
  }

  return new Set(
    scopeString
      .split(/\s+/u)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

function parseRoles(payload: JWTPayload) {
  const roles = payload.roles;
  if (!Array.isArray(roles)) {
    return new Set<string>();
  }

  return new Set(
    roles
      .filter((role): role is string => typeof role === "string")
      .map((role) => role.trim())
      .filter((role) => role.length > 0)
  );
}

function hasAny(items: Set<string>, required: readonly string[]) {
  if (required.length === 0) {
    return true;
  }

  return required.some((item) => items.has(item));
}

interface VerifyJwtOptions {
  token: string;
  issuer: string;
  audience: string;
  clockToleranceSeconds: number;
}

class JwtVerifier {
  private readonly sharedSecret: Uint8Array | null;
  private readonly jwks;

  constructor(config: ApiConfig) {
    this.sharedSecret = config.authLocalJwtSecret
      ? new TextEncoder().encode(config.authLocalJwtSecret)
      : null;
    this.jwks = config.authJwksUri ? createRemoteJWKSet(new URL(config.authJwksUri)) : null;
  }

  async verify(options: VerifyJwtOptions) {
    const verifyOptions = {
      issuer: options.issuer,
      audience: options.audience,
      clockTolerance: options.clockToleranceSeconds
    };

    if (this.sharedSecret) {
      return jwtVerify(options.token, this.sharedSecret, {
        ...verifyOptions,
        algorithms: ["HS256"]
      });
    }

    if (!this.jwks) {
      throw invalidToken("Token verification is not configured");
    }

    return jwtVerify(options.token, this.jwks, {
      ...verifyOptions,
      algorithms: ["RS256"]
    });
  }
}

export class AccessTokenVerifier {
  private readonly config: ApiConfig;
  private readonly jwtVerifier: JwtVerifier;
  private readonly oauthSigningSecret: Uint8Array;

  constructor(config: ApiConfig) {
    this.config = config;
    this.jwtVerifier = new JwtVerifier(config);
    this.oauthSigningSecret = new TextEncoder().encode(config.oauthTokenSigningSecret);
  }

  async verifyAuthorizationHeader(
    authorizationHeader: string | undefined
  ): Promise<VerifiedAccessToken> {
    const token = parseBearerToken(authorizationHeader);

    const { payload } = await this.jwtVerifier.verify({
      token,
      issuer: this.config.authIssuer,
      audience: this.config.authAudience,
      clockToleranceSeconds: this.config.authClockToleranceSeconds
    });

    const tenantId = claimAsString(payload, "tid");
    if (!tenantId) {
      throw invalidToken("Token is missing tenant claim");
    }

    const actorClientId = claimAsString(payload, "azp") ?? claimAsString(payload, "appid");
    if (!actorClientId) {
      throw invalidToken("Token is missing actor client claim");
    }

    const scopes = parseScopes(payload);
    const appRoles = parseRoles(payload);
    const hasScopes = scopes.size > 0;
    const hasRoles = appRoles.size > 0;

    if ((hasScopes && hasRoles) || (!hasScopes && !hasRoles)) {
      throw tokenUnclassified();
    }

    if (
      this.config.authAllowedClientIds.length > 0 &&
      !this.config.authAllowedClientIds.includes(actorClientId)
    ) {
      throw invalidToken("Client application is not allowlisted");
    }

    if (hasScopes) {
      const subjectId = claimAsString(payload, "oid");
      if (!subjectId) {
        throw invalidToken("Delegated token is missing oid");
      }

      return {
        tokenType: "delegated",
        tenantId,
        subjectType: "user",
        subjectId,
        actorClientId,
        scopes,
        appRoles,
        rawClaims: payload as Record<string, unknown>
      };
    }

    const idtyp = claimAsString(payload, "idtyp");
    if (idtyp && idtyp !== "app") {
      throw invalidToken("App token idtyp claim must be app");
    }

    return {
      tokenType: "app",
      tenantId,
      subjectType: "app",
      subjectId: actorClientId,
      actorClientId,
      scopes,
      appRoles,
      rawClaims: payload as Record<string, unknown>
    };
  }

  async verifyScimAuthorizationHeader(
    authorizationHeader: string | undefined
  ): Promise<ScimTokenContext> {
    const token = parseBearerToken(authorizationHeader);
    const { payload } = await jwtVerify(token, this.oauthSigningSecret, {
      issuer: this.config.oauthTokenIssuer,
      audience: this.config.oauthTokenAudience,
      clockTolerance: this.config.authClockToleranceSeconds,
      algorithms: ["HS256"]
    });

    const tenantId = claimAsString(payload, "tid");
    if (!tenantId) {
      throw invalidToken("SCIM token missing tenant claim");
    }

    const clientId = claimAsString(payload, "azp") ?? claimAsString(payload, "appid");
    if (!clientId) {
      throw invalidToken("SCIM token missing client claim");
    }

    const idtyp = claimAsString(payload, "idtyp");
    if (idtyp !== "app") {
      throw invalidToken("SCIM token must be an app token");
    }

    const scopes = parseScopes(payload);
    const roles = parseRoles(payload);
    const scimScopeAllowed = hasAny(scopes, ["scim.write"]);
    const scimRoleAllowed = hasAny(roles, ["scim.provisioner"]);
    if (!scimScopeAllowed && !scimRoleAllowed) {
      throw permissionDenied("SCIM token lacks provisioning scope");
    }

    return {
      tenantId,
      clientId,
      scopes
    };
  }
}
