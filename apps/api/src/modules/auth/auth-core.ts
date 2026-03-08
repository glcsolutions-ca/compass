import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  OrganizationMembershipRoleSchema,
  type OrganizationMembershipRole
} from "@compass/contracts";
import { z } from "zod";

export const SESSION_COOKIE_NAME = "__Host-compass_session";
export const DEFAULT_OIDC_SCOPE = "openid profile email";
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8;
export const DEFAULT_SESSION_IDLE_TTL_SECONDS = 60 * 60;
export const OIDC_REQUEST_TTL_SECONDS = 10 * 60;
export const DESKTOP_HANDOFF_TTL_SECONDS = 2 * 60;
export const ADMIN_CONSENT_REQUEST_MARKER = "admin-consent";
const EmailAddressSchema = z.string().email();
const OIDC_ENCRYPTED_PAYLOAD_PREFIX = "enc:v1:";
const OIDC_STATE_ENCRYPTION_KEY_BYTES = 32;
export const DEFAULT_DESKTOP_AUTH_SCHEME = "ca.glsolutions.compass";
export const DEFAULT_MOCK_ENTRA_TID = "00000000-0000-0000-0000-000000000000";
export const DEFAULT_MOCK_ENTRA_OID = "11111111-1111-1111-1111-111111111111";
export const DEFAULT_MOCK_EMAIL = "developer@local.test";
export const DEFAULT_MOCK_DISPLAY_NAME = "Local Developer";

export type AuthMode = "mock" | "entra";
export type AuthClient = "browser" | "desktop";

export interface EntraAuthConfig {
  authMode: AuthMode;
  clientId?: string;
  clientSecret?: string;
  oidcStateEncryptionKey?: string;
  redirectUri?: string;
  authorityHost: string;
  tenantSegment: string;
  allowedTenantIds: string[];
  scope: string;
  webBaseUrl: string;
  desktopAuthScheme: string;
  sessionTtlSeconds: number;
  sessionIdleTtlSeconds: number;
}

export interface OidcIdTokenClaims {
  tid: string;
  oid: string;
  iss: string;
  email: string | null;
  upn: string | null;
  name: string | null;
}

export interface OidcClient {
  buildAuthorizeUrl(input: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  buildAdminConsentUrl(input: { tenantHint?: string; redirectUri: string; state: string }): string;
  exchangeCodeForIdToken(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<string>;
  verifyIdToken(input: { idToken: string; expectedNonce: string }): Promise<OidcIdTokenClaims>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface UserRecord {
  id: string;
  primaryEmail: string | null;
  displayName: string | null;
}

export interface OrganizationMembershipRecord {
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  role: OrganizationMembershipRole;
  status: "active" | "invited" | "disabled";
}

export interface WorkspaceMembershipRecord {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  isPersonal: boolean;
  role: "admin" | "member";
  status: "active" | "invited" | "disabled";
}

export interface WorkspaceRecord {
  id: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  slug: string;
  name: string;
  isPersonal: boolean;
  status: "active" | "disabled";
}

export interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
  primaryEmail: string | null;
  displayName: string | null;
}

export interface OidcRequestRecord {
  id: string;
  nonceHash: string;
  encryptedPayload: string;
  returnTo: string | null;
}

export interface OidcRequestSecrets {
  flow: "entra-login" | "admin-consent";
  client: AuthClient;
  nonce: string;
  pkceVerifier: string;
}

export interface DesktopHandoffRecord {
  id: string;
  userId: string;
  redirectTo: string;
}

export interface InviteRecord {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  organizationId: string;
  emailNormalized: string;
  role: "admin" | "member";
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
}

export interface WorkspaceMembershipCheck {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  organizationId: string;
  organizationSlug: string;
  organizationName: string;
  isPersonal: boolean;
  membershipRole: "admin" | "member";
  membershipStatus: "active" | "invited" | "disabled";
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function encodePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseBooleanQueryFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function sanitizeUriScheme(value: string | undefined): string {
  const normalized = asStringOrNull(value)?.toLowerCase() ?? DEFAULT_DESKTOP_AUTH_SCHEME;
  return /^[a-z][a-z0-9+.-]*$/u.test(normalized) ? normalized : DEFAULT_DESKTOP_AUTH_SCHEME;
}

export function asValidEmailOrNull(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return EmailAddressSchema.safeParse(value).success ? value : null;
}

export function resolvePrimaryEmail(input: {
  email: string | null;
  upn: string | null;
}): string | null {
  return asValidEmailOrNull(input.email) ?? asValidEmailOrNull(input.upn);
}

export function buildPersonalTenantSlug(userId: string): string {
  const normalized = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-");
  const slugSuffix = normalized.replace(/^-+|-+$/gu, "") || "user";
  return `personal-${slugSuffix}`;
}

export function buildPersonalTenantName(input: {
  displayName: string | null;
  primaryEmail: string | null;
}): string {
  const displayName = asStringOrNull(input.displayName);
  if (displayName) {
    return `${displayName} Personal Workspace`;
  }

  const email = asValidEmailOrNull(input.primaryEmail);
  if (email) {
    return `${email} Personal Workspace`;
  }

  return "Personal Workspace";
}

export function parseOidcStateEncryptionKey(raw: string | undefined): Buffer | null {
  const value = asStringOrNull(raw);
  if (!value) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.length !== OIDC_STATE_ENCRYPTION_KEY_BYTES) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function encryptOidcRequestPayload(input: {
  encryptionKey: Buffer;
  flow: "entra-login" | "admin-consent";
  client: AuthClient;
  nonce: string;
  pkceVerifier: string;
}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", input.encryptionKey, iv);
  const plaintext = JSON.stringify({
    flow: input.flow,
    client: input.client,
    nonce: input.nonce,
    pkceVerifier: input.pkceVerifier
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${OIDC_ENCRYPTED_PAYLOAD_PREFIX}${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptOidcRequestPayload(input: {
  encryptionKey: Buffer;
  encodedPayload: string;
}): OidcRequestSecrets {
  if (!input.encodedPayload.startsWith(OIDC_ENCRYPTED_PAYLOAD_PREFIX)) {
    throw new Error("OIDC request payload format is invalid");
  }

  const encodedParts = input.encodedPayload.slice(OIDC_ENCRYPTED_PAYLOAD_PREFIX.length).split(".");
  if (encodedParts.length !== 3) {
    throw new Error("OIDC request payload format is invalid");
  }

  const [ivEncoded, ciphertextEncoded, tagEncoded] = encodedParts as [string, string, string];
  const iv = Buffer.from(ivEncoded, "base64url");
  const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", input.encryptionKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  const payload = JSON.parse(decrypted) as {
    flow?: unknown;
    client?: unknown;
    nonce?: unknown;
    pkceVerifier?: unknown;
  };

  const flow = payload.flow;
  if (flow !== "entra-login" && flow !== "admin-consent") {
    throw new Error("OIDC request payload flow is invalid");
  }

  const nonce = asStringOrNull(payload.nonce);
  const pkceVerifier = asStringOrNull(payload.pkceVerifier);
  const client =
    payload.client === "browser" || payload.client === "desktop" ? payload.client : "browser";
  if (!nonce || !pkceVerifier) {
    throw new Error("OIDC request payload is missing required fields");
  }

  return {
    flow,
    client,
    nonce,
    pkceVerifier
  };
}

export function sanitizeReturnTo(returnTo: string | undefined): string | null {
  const value = asStringOrNull(returnTo);
  if (!value) {
    return null;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  const parsed = new URL(value, "https://compass.local");
  const pathname = parsed.pathname;
  const isCanonicalPath =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/workspaces" ||
    pathname.startsWith("/workspaces/");
  if (!isCanonicalPath) {
    return null;
  }

  return `${pathname}${parsed.search}`;
}

export function buildLoginRedirect(input: {
  error?: string;
  consent?: "granted" | "denied";
  returnTo?: string | null;
  tenantHint?: string | null;
}): string {
  const query = new URLSearchParams();
  if (input.error) {
    query.set("error", input.error);
  }
  if (input.consent) {
    query.set("consent", input.consent);
  }

  const returnTo = sanitizeReturnTo(input.returnTo ?? undefined) || "/";
  query.set("returnTo", returnTo);

  const tenantHint = asStringOrNull(input.tenantHint);
  if (tenantHint) {
    query.set("tenantHint", tenantHint);
  }

  return `/login?${query.toString()}`;
}

export function nowPlusSeconds(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1000);
}

export function extractClientIp(
  forwardedFor: string | undefined,
  fallback: string | undefined
): string {
  const candidate = asStringOrNull(forwardedFor)?.split(",").at(0)?.trim();
  return candidate || asStringOrNull(fallback) || "unknown";
}

export function toOrganizationRole(value: unknown): OrganizationMembershipRole {
  const parsed = OrganizationMembershipRoleSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Unexpected organization role '${String(value)}'`);
  }

  return parsed.data;
}

export function toWorkspaceRole(value: unknown): "admin" | "member" {
  return value === "admin" ? "admin" : "member";
}

export const __internalAuthService = {
  normalizeEmail,
  hashValue,
  randomToken,
  encodePkceChallenge,
  asStringOrNull,
  parseBooleanQueryFlag,
  sanitizeUriScheme,
  asValidEmailOrNull,
  resolvePrimaryEmail,
  buildPersonalTenantSlug,
  buildPersonalTenantName,
  parseOidcStateEncryptionKey,
  encryptOidcRequestPayload,
  decryptOidcRequestPayload,
  sanitizeReturnTo,
  buildLoginRedirect,
  nowPlusSeconds,
  extractClientIp,
  toOrganizationRole,
  toWorkspaceRole
};
