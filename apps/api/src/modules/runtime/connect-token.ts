import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface SessionConnectTokenPayload {
  sessionIdentifier: string;
  bootId: string;
  exp: number;
  iat: number;
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function signPayload(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function createConnectTokenSecret(input?: string): string {
  const candidate = input?.trim();
  if (candidate) {
    return candidate;
  }

  return randomBytes(32).toString("hex");
}

export function issueSessionConnectToken(input: {
  secret: string;
  sessionIdentifier: string;
  bootId: string;
  now?: Date;
  ttlMs: number;
}): string {
  const now = input.now ?? new Date();
  const payload: SessionConnectTokenPayload = {
    sessionIdentifier: input.sessionIdentifier,
    bootId: input.bootId,
    iat: now.getTime(),
    exp: now.getTime() + input.ttlMs
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload, input.secret).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifySessionConnectToken(input: {
  token: string;
  secret: string;
  now?: Date;
}): SessionConnectTokenPayload | null {
  const now = input.now ?? new Date();
  const [encodedPayload, encodedSignature] = input.token.split(".");
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  let payload: SessionConnectTokenPayload;
  try {
    payload = JSON.parse(
      decodeBase64Url(encodedPayload).toString("utf8")
    ) as SessionConnectTokenPayload;
  } catch {
    return null;
  }

  if (
    typeof payload.sessionIdentifier !== "string" ||
    typeof payload.bootId !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  let providedSignature: Buffer;
  try {
    providedSignature = decodeBase64Url(encodedSignature);
  } catch {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload, input.secret);
  if (
    providedSignature.byteLength !== expectedSignature.byteLength ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    return null;
  }

  if (payload.exp <= now.getTime()) {
    return null;
  }

  return payload;
}
