import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { ApiConfig } from "../../config/index.js";

export interface Principal {
  subject: string;
  scopes: string[];
  roles: string[];
  payload: JWTPayload;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUri: string) {
  const cached = jwksCache.get(jwksUri);
  if (cached) {
    return cached;
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  jwksCache.set(jwksUri, jwks);
  return jwks;
}

export function buildAcceptedIssuers(configuredIssuer: string): string[] {
  const issuer = configuredIssuer.trim();
  if (!issuer) {
    return [];
  }

  const normalized = issuer.replace(/\/+$/, "");
  const issuers = new Set<string>([issuer]);

  const v2IssuerMatch = normalized.match(
    /^https:\/\/login\.microsoftonline\.com\/([^/]+)\/v2\.0$/i
  );
  if (v2IssuerMatch?.[1]) {
    issuers.add(`https://sts.windows.net/${v2IssuerMatch[1]}/`);
  }

  const stsIssuerMatch = normalized.match(/^https:\/\/sts\.windows\.net\/([^/]+)$/i);
  if (stsIssuerMatch?.[1]) {
    issuers.add(`https://login.microsoftonline.com/${stsIssuerMatch[1]}/v2.0`);
  }

  return Array.from(issuers);
}

function parseScopes(payload: JWTPayload): string[] {
  if (typeof payload.scp === "string") {
    return payload.scp
      .split(" ")
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
  }

  return [];
}

function parseRoles(payload: JWTPayload): string[] {
  if (Array.isArray(payload.roles)) {
    return payload.roles.map((role) => String(role));
  }

  return [];
}

function deriveSubject(payload: JWTPayload): string | null {
  if (typeof payload.oid === "string" && payload.oid.length > 0) {
    return payload.oid;
  }

  if (typeof payload.sub === "string" && payload.sub.length > 0) {
    return payload.sub;
  }

  return null;
}

function toPrincipal(payload: JWTPayload): Principal | null {
  const subject = deriveSubject(payload);

  if (!subject) {
    return null;
  }

  return {
    subject,
    scopes: parseScopes(payload),
    roles: parseRoles(payload),
    payload
  };
}

export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

export async function verifyAccessToken(
  token: string,
  config: ApiConfig
): Promise<Principal | null> {
  try {
    if (config.authMode === "entra") {
      const acceptedIssuers = buildAcceptedIssuers(config.entraIssuer!);
      const verification = await jwtVerify(token, getJwks(config.entraJwksUri!), {
        issuer: acceptedIssuers.length > 0 ? acceptedIssuers : config.entraIssuer,
        audience: config.entraAudience
      });

      return toPrincipal(verification.payload);
    }

    const secret = new TextEncoder().encode(config.devJwtSecret);
    const verification = await jwtVerify(token, secret);
    return toPrincipal(verification.payload);
  } catch {
    return null;
  }
}

export function hasRequiredScope(principal: Principal, requiredScope: string): boolean {
  return principal.scopes.includes(requiredScope) || principal.roles.includes("TimeSync.Admin");
}
