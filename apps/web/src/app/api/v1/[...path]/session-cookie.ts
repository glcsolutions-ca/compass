import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

export interface SessionPayload {
  version: 1;
  sid: string;
  token: string;
  issuedAtMs: number;
  lastSeenAtMs: number;
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signSessionPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function serializeSession(payload: SessionPayload, secret: string) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function parseSessionCookie(
  rawCookie: string | undefined,
  secret: string
): SessionPayload | null {
  if (!rawCookie) {
    return null;
  }

  const [payloadPart, signaturePart] = rawCookie.split(".");
  if (!payloadPart || !signaturePart) {
    return null;
  }

  const expected = signSessionPayload(payloadPart, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signaturePart);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadPart)) as SessionPayload;
    if (parsed.version !== 1) {
      return null;
    }
    if (!parsed.sid || !parsed.token) {
      return null;
    }

    const now = Date.now();
    if (now - parsed.issuedAtMs > SESSION_ABSOLUTE_TIMEOUT_MS) {
      return null;
    }
    if (now - parsed.lastSeenAtMs > SESSION_IDLE_TIMEOUT_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function createSignedSessionCookie(input: {
  accessToken: string;
  secret: string;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const payload: SessionPayload = {
    version: 1,
    sid: randomUUID(),
    token: input.accessToken,
    issuedAtMs: nowMs,
    lastSeenAtMs: nowMs
  };
  return serializeSession(payload, input.secret);
}
