import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const SSO_COOKIE_NAME = "__Host-compass_sso";
export const OIDC_STATE_COOKIE_NAME = "__Host-compass_oidc_state";

const SSO_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
const SSO_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const OIDC_STATE_TIMEOUT_MS = 10 * 60 * 1000;

export interface SsoSessionPayload {
  version: 1;
  sid: string;
  sub: string;
  tid: string;
  name?: string;
  email?: string;
  issuedAtMs: number;
  lastSeenAtMs: number;
}

export interface OidcStatePayload {
  version: 1;
  state: string;
  nonce: string;
  codeVerifier: string;
  nextPath: string;
  issuedAtMs: number;
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function serializeSignedPayload(payload: unknown, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function parseSignedPayload<T>(rawCookie: string | undefined, secret: string): T | null {
  if (!rawCookie) {
    return null;
  }

  const [payloadPart, signaturePart] = rawCookie.split(".");
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expected = signPayload(payloadPart, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signaturePart);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payloadPart)) as T;
  } catch {
    return null;
  }
}

export function createOidcStateCookieValue(input: {
  state: string;
  nonce: string;
  codeVerifier: string;
  nextPath: string;
  secret: string;
  nowMs?: number;
}) {
  const payload: OidcStatePayload = {
    version: 1,
    state: input.state,
    nonce: input.nonce,
    codeVerifier: input.codeVerifier,
    nextPath: input.nextPath,
    issuedAtMs: input.nowMs ?? Date.now()
  };

  return serializeSignedPayload(payload, input.secret);
}

export function parseOidcStateCookie(
  rawCookie: string | undefined,
  secret: string
): OidcStatePayload | null {
  const parsed = parseSignedPayload<OidcStatePayload>(rawCookie, secret);
  if (!parsed || parsed.version !== 1) {
    return null;
  }

  if (!parsed.state || !parsed.nonce || !parsed.codeVerifier || !parsed.nextPath) {
    return null;
  }

  const now = Date.now();
  if (now - parsed.issuedAtMs > OIDC_STATE_TIMEOUT_MS) {
    return null;
  }

  if (!parsed.nextPath.startsWith("/") || parsed.nextPath.startsWith("//")) {
    return null;
  }

  return parsed;
}

export function createSignedSsoCookie(input: {
  sub: string;
  tid: string;
  secret: string;
  name?: string;
  email?: string;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const payload: SsoSessionPayload = {
    version: 1,
    sid: randomUUID(),
    sub: input.sub,
    tid: input.tid,
    issuedAtMs: nowMs,
    lastSeenAtMs: nowMs
  };

  if (input.name) {
    payload.name = input.name;
  }
  if (input.email) {
    payload.email = input.email;
  }

  return serializeSignedPayload(payload, input.secret);
}

export function serializeSsoCookie(payload: SsoSessionPayload, secret: string) {
  return serializeSignedPayload(payload, secret);
}

export function parseSsoCookie(rawCookie: string | undefined, secret: string): SsoSessionPayload | null {
  const parsed = parseSignedPayload<SsoSessionPayload>(rawCookie, secret);
  if (!parsed || parsed.version !== 1) {
    return null;
  }

  if (!parsed.sid || !parsed.sub || !parsed.tid) {
    return null;
  }

  const now = Date.now();
  if (now - parsed.issuedAtMs > SSO_ABSOLUTE_TIMEOUT_MS) {
    return null;
  }
  if (now - parsed.lastSeenAtMs > SSO_IDLE_TIMEOUT_MS) {
    return null;
  }

  return parsed;
}

export function refreshSsoCookie(session: SsoSessionPayload): SsoSessionPayload {
  return {
    ...session,
    lastSeenAtMs: Date.now()
  };
}

export function oidcStateCookieHeader(value: string) {
  return `${OIDC_STATE_COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

export function clearOidcStateCookieHeader() {
  return `${OIDC_STATE_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function ssoCookieHeader(value: string) {
  return `${SSO_COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`;
}

export function clearSsoCookieHeader() {
  return `${SSO_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function randomToken(size = 32) {
  return randomBytes(size).toString("base64url");
}
