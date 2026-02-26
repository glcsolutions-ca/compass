import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Pool } from "pg";
import { z } from "zod";
import {
  AuthMeResponseSchema,
  MembershipRoleSchema,
  TenantCreateRequestSchema,
  TenantInviteCreateRequestSchema,
  type AuthMeResponse,
  type MembershipRole,
  type TenantCreateRequest,
  type TenantInviteCreateRequest
} from "@compass/contracts";

export const SESSION_COOKIE_NAME = "__Host-compass_session";
const DEFAULT_OIDC_SCOPE = "openid profile email";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 8;
const DEFAULT_SESSION_IDLE_TTL_SECONDS = 60 * 60;
const OIDC_REQUEST_TTL_SECONDS = 10 * 60;
const ADMIN_CONSENT_REQUEST_MARKER = "admin-consent";
const EmailAddressSchema = z.string().email();
const OIDC_ENCRYPTED_PAYLOAD_PREFIX = "enc:v1:";
const OIDC_STATE_ENCRYPTION_KEY_BYTES = 32;
const DEFAULT_MOCK_ENTRA_TID = "00000000-0000-0000-0000-000000000000";
const DEFAULT_MOCK_ENTRA_OID = "11111111-1111-1111-1111-111111111111";
const DEFAULT_MOCK_EMAIL = "developer@local.test";
const DEFAULT_MOCK_DISPLAY_NAME = "Local Developer";

export type AuthMode = "mock" | "entra";

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

interface UserRecord {
  id: string;
  primaryEmail: string | null;
  displayName: string | null;
}

interface MembershipRecord {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: MembershipRole;
  status: "active" | "invited" | "disabled";
}

interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: "active" | "disabled";
}

interface SessionRecord {
  id: string;
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
  primaryEmail: string | null;
  displayName: string | null;
}

interface OidcRequestRecord {
  id: string;
  nonceHash: string;
  encryptedPayload: string;
  returnTo: string | null;
}

interface InviteRecord {
  id: string;
  tenantId: string;
  tenantSlug: string;
  emailNormalized: string;
  role: MembershipRole;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
}

interface TenantMembershipCheck {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  membershipRole: MembershipRole;
  membershipStatus: "active" | "invited" | "disabled";
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function encodePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBooleanQueryFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function asValidEmailOrNull(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return EmailAddressSchema.safeParse(value).success ? value : null;
}

function resolvePrimaryEmail(input: { email: string | null; upn: string | null }): string | null {
  return asValidEmailOrNull(input.email) ?? asValidEmailOrNull(input.upn);
}

function parseOidcStateEncryptionKey(raw: string | undefined): Buffer | null {
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

function encryptOidcRequestPayload(input: {
  encryptionKey: Buffer;
  flow: "entra-login" | "admin-consent";
  nonce: string;
  pkceVerifier: string;
}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", input.encryptionKey, iv);
  const plaintext = JSON.stringify({
    flow: input.flow,
    nonce: input.nonce,
    pkceVerifier: input.pkceVerifier
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${OIDC_ENCRYPTED_PAYLOAD_PREFIX}${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${tag.toString("base64url")}`;
}

function decryptOidcRequestPayload(input: { encryptionKey: Buffer; encodedPayload: string }): {
  flow: "entra-login" | "admin-consent";
  nonce: string;
  pkceVerifier: string;
} {
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
    nonce?: unknown;
    pkceVerifier?: unknown;
  };

  const flow = payload.flow;
  if (flow !== "entra-login" && flow !== "admin-consent") {
    throw new Error("OIDC request payload flow is invalid");
  }

  const nonce = asStringOrNull(payload.nonce);
  const pkceVerifier = asStringOrNull(payload.pkceVerifier);
  if (!nonce || !pkceVerifier) {
    throw new Error("OIDC request payload is missing required fields");
  }

  return {
    flow,
    nonce,
    pkceVerifier
  };
}

function sanitizeReturnTo(returnTo: string | undefined): string | null {
  if (!returnTo) {
    return null;
  }

  const trimmed = returnTo.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  return trimmed;
}

function buildLoginRedirect(input: {
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

function nowPlusSeconds(now: Date, seconds: number): Date {
  return new Date(now.getTime() + seconds * 1000);
}

function extractClientIp(forwardedFor: string | undefined, fallback: string | undefined): string {
  const forwarded = asStringOrNull(forwardedFor)?.split(",").at(0)?.trim();
  return forwarded || asStringOrNull(fallback) || "unknown";
}

function toMembershipRole(value: unknown): MembershipRole {
  const parsed = MembershipRoleSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Unexpected membership role '${String(value)}'`);
  }

  return parsed.data;
}

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

export class AuthRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async clearAuthData(): Promise<void> {
    await this.pool.query(`
      truncate table
        auth_audit_events,
        auth_sessions,
        auth_oidc_requests,
        invites,
        memberships,
        identities,
        users,
        tenants
      restart identity cascade
    `);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createOidcRequest(input: {
    state: string;
    nonceHash: string;
    encryptedPayload: string;
    returnTo: string | null;
    now: Date;
  }): Promise<void> {
    const expiresAt = nowPlusSeconds(input.now, OIDC_REQUEST_TTL_SECONDS).toISOString();

    await this.pool.query(
      `
        insert into auth_oidc_requests (
          id,
          state_hash,
          nonce_hash,
          pkce_verifier_encrypted_or_hashed,
          return_to,
          expires_at,
          created_at
        ) values ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
      `,
      [
        randomUUID(),
        hashValue(input.state),
        input.nonceHash,
        input.encryptedPayload,
        input.returnTo,
        expiresAt,
        input.now.toISOString()
      ]
    );
  }

  async consumeOidcRequest(state: string, now: Date): Promise<OidcRequestRecord | null> {
    const result = await this.pool.query<{
      id: string;
      nonce_hash: string;
      pkce_verifier_encrypted_or_hashed: string;
      return_to: string | null;
    }>(
      `
        update auth_oidc_requests
        set consumed_at = $2::timestamptz
        where state_hash = $1
          and consumed_at is null
          and expires_at > $2::timestamptz
        returning id, nonce_hash, pkce_verifier_encrypted_or_hashed, return_to
      `,
      [hashValue(state), now.toISOString()]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      nonceHash: row.nonce_hash,
      encryptedPayload: row.pkce_verifier_encrypted_or_hashed,
      returnTo: row.return_to
    };
  }

  async findOrCreateUserForIdentity(input: OidcIdTokenClaims): Promise<UserRecord> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const existing = await client.query<{
        user_id: string;
        primary_email: string | null;
        display_name: string | null;
      }>(
        `
          select u.id as user_id, u.primary_email, u.display_name
          from identities i
          join users u on u.id = i.user_id
          where i.provider = 'entra' and i.entra_tid = $1 and i.entra_oid = $2
          for update
        `,
        [input.tid, input.oid]
      );

      const email = resolvePrimaryEmail({
        email: input.email,
        upn: input.upn
      });
      if ((existing.rowCount ?? 0) > 0) {
        const row = existing.rows.at(0);
        if (!row) {
          throw new Error("Identity query returned no rows for existing identity");
        }
        await client.query(
          `
            update users
            set primary_email = $2,
                display_name = $3,
                updated_at = now()
            where id = $1
          `,
          [row.user_id, email, input.name]
        );

        await client.query(
          `
            update identities
            set iss = $3,
                email = $4,
                upn = $5,
                updated_at = now()
            where provider = 'entra' and entra_tid = $1 and entra_oid = $2
          `,
          [input.tid, input.oid, input.iss, input.email, input.upn]
        );

        await client.query("commit");
        return {
          id: row.user_id,
          primaryEmail: asValidEmailOrNull(email),
          displayName: input.name
        };
      }

      const userId = randomUUID();
      await client.query(
        `
          insert into users (id, primary_email, display_name, created_at, updated_at)
          values ($1, $2, $3, now(), now())
        `,
        [userId, email, input.name]
      );

      await client.query(
        `
          insert into identities (
            id,
            user_id,
            provider,
            entra_tid,
            entra_oid,
            iss,
            email,
            upn,
            created_at,
            updated_at
          ) values ($1, $2, 'entra', $3, $4, $5, $6, $7, now(), now())
        `,
        [randomUUID(), userId, input.tid, input.oid, input.iss, input.email, input.upn]
      );

      await client.query("commit");
      return {
        id: userId,
        primaryEmail: asValidEmailOrNull(email),
        displayName: input.name
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(input: {
    userId: string;
    sessionTokenHash: string;
    userAgentHash: string | null;
    ipHash: string | null;
    now: Date;
    expiresAt: Date;
  }): Promise<string> {
    const sessionId = randomUUID();

    await this.pool.query(
      `
        insert into auth_sessions (
          id,
          user_id,
          token_hash,
          user_agent_hash,
          ip_hash,
          created_at,
          expires_at,
          last_seen_at
        ) values ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $6::timestamptz)
      `,
      [
        sessionId,
        input.userId,
        input.sessionTokenHash,
        input.userAgentHash,
        input.ipHash,
        input.now.toISOString(),
        input.expiresAt.toISOString()
      ]
    );

    return sessionId;
  }

  async readSessionByTokenHash(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    const result = await this.pool.query<{
      id: string;
      user_id: string;
      expires_at: string;
      revoked_at: string | null;
      last_seen_at: string;
      primary_email: string | null;
      display_name: string | null;
    }>(
      `
        select
          s.id,
          s.user_id,
          s.expires_at,
          s.revoked_at,
          s.last_seen_at,
          u.primary_email,
          u.display_name
        from auth_sessions s
        join users u on u.id = s.user_id
        where s.token_hash = $1
          and s.revoked_at is null
          and s.expires_at > $2::timestamptz
      `,
      [tokenHash, now.toISOString()]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      lastSeenAt: row.last_seen_at,
      primaryEmail: row.primary_email,
      displayName: row.display_name
    };
  }

  async touchSession(sessionId: string, now: Date): Promise<void> {
    await this.pool.query(
      `
        update auth_sessions
        set last_seen_at = $2::timestamptz
        where id = $1 and revoked_at is null
      `,
      [sessionId, now.toISOString()]
    );
  }

  async revokeSessionByTokenHash(tokenHash: string, now: Date): Promise<void> {
    await this.pool.query(
      `
        update auth_sessions
        set revoked_at = $2::timestamptz
        where token_hash = $1
          and revoked_at is null
      `,
      [tokenHash, now.toISOString()]
    );
  }

  async listMemberships(userId: string): Promise<MembershipRecord[]> {
    const result = await this.pool.query<{
      tenant_id: string;
      tenant_slug: string;
      tenant_name: string;
      role: string;
      status: "active" | "invited" | "disabled";
    }>(
      `
        select
          m.tenant_id,
          t.slug as tenant_slug,
          t.name as tenant_name,
          m.role,
          m.status
        from memberships m
        join tenants t on t.id = m.tenant_id
        where m.user_id = $1
        order by t.slug asc
      `,
      [userId]
    );

    return result.rows.map((row) => ({
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      role: toMembershipRole(row.role),
      status: row.status
    }));
  }

  async createTenant(input: {
    userId: string;
    request: TenantCreateRequest;
    now: Date;
  }): Promise<{ tenant: TenantRecord; membership: MembershipRecord }> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const tenantId = randomUUID();

      await client.query(
        `
          insert into tenants (id, slug, name, status, created_at, updated_at)
          values ($1, $2, $3, 'active', $4::timestamptz, $4::timestamptz)
        `,
        [tenantId, input.request.slug, input.request.name, input.now.toISOString()]
      );

      await client.query(
        `
          insert into memberships (
            tenant_id,
            user_id,
            role,
            status,
            created_at,
            updated_at
          ) values ($1, $2, 'owner', 'active', $3::timestamptz, $3::timestamptz)
        `,
        [tenantId, input.userId, input.now.toISOString()]
      );

      await client.query("commit");

      return {
        tenant: {
          id: tenantId,
          slug: input.request.slug,
          name: input.request.name,
          status: "active"
        },
        membership: {
          tenantId,
          tenantSlug: input.request.slug,
          tenantName: input.request.name,
          role: "owner",
          status: "active"
        }
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async requireTenantMembership(input: {
    tenantSlug: string;
    userId: string;
  }): Promise<TenantMembershipCheck | null> {
    const result = await this.pool.query<{
      tenant_id: string;
      tenant_slug: string;
      tenant_name: string;
      membership_role: string;
      membership_status: "active" | "invited" | "disabled";
    }>(
      `
        select
          t.id as tenant_id,
          t.slug as tenant_slug,
          t.name as tenant_name,
          m.role as membership_role,
          m.status as membership_status
        from tenants t
        join memberships m on m.tenant_id = t.id
        where t.slug = $1 and m.user_id = $2
      `,
      [input.tenantSlug, input.userId]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    return {
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      membershipRole: toMembershipRole(row.membership_role),
      membershipStatus: row.membership_status
    };
  }

  async findTenantBySlug(slug: string): Promise<TenantRecord | null> {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
      status: "active" | "disabled";
    }>(
      `
        select id, slug, name, status
        from tenants
        where slug = $1
      `,
      [slug]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status
    };
  }

  async listTenantMembers(tenantId: string): Promise<
    Array<{
      userId: string;
      primaryEmail: string | null;
      displayName: string | null;
      role: MembershipRole;
      status: "active" | "invited" | "disabled";
    }>
  > {
    const result = await this.pool.query<{
      user_id: string;
      primary_email: string | null;
      display_name: string | null;
      role: string;
      status: "active" | "invited" | "disabled";
    }>(
      `
        select
          m.user_id,
          u.primary_email,
          u.display_name,
          m.role,
          m.status
        from memberships m
        join users u on u.id = m.user_id
        where m.tenant_id = $1
        order by u.primary_email asc nulls last, u.id asc
      `,
      [tenantId]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      primaryEmail: asValidEmailOrNull(row.primary_email),
      displayName: row.display_name,
      role: toMembershipRole(row.role),
      status: row.status
    }));
  }

  async createInvite(input: {
    tenantId: string;
    emailNormalized: string;
    role: Exclude<MembershipRole, "owner">;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: Date;
  }): Promise<{ inviteId: string; expiresAt: string }> {
    const inviteId = randomUUID();

    await this.pool.query(
      `
        insert into invites (
          id,
          tenant_id,
          email_normalized,
          role,
          token_hash,
          invited_by_user_id,
          expires_at,
          created_at
        ) values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::timestamptz,
          now()
        )
      `,
      [
        inviteId,
        input.tenantId,
        input.emailNormalized,
        input.role,
        input.tokenHash,
        input.invitedByUserId,
        input.expiresAt.toISOString()
      ]
    );

    return {
      inviteId,
      expiresAt: input.expiresAt.toISOString()
    };
  }

  async findInviteByToken(input: {
    tenantSlug: string;
    tokenHash: string;
  }): Promise<InviteRecord | null> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      tenant_slug: string;
      email_normalized: string;
      role: string;
      expires_at: string;
      accepted_at: string | null;
      accepted_by_user_id: string | null;
    }>(
      `
        select
          i.id,
          i.tenant_id,
          t.slug as tenant_slug,
          i.email_normalized,
          i.role,
          i.expires_at,
          i.accepted_at,
          i.accepted_by_user_id
        from invites i
        join tenants t on t.id = i.tenant_id
        where t.slug = $1
          and i.token_hash = $2
      `,
      [input.tenantSlug, input.tokenHash]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      emailNormalized: row.email_normalized,
      role: toMembershipRole(row.role),
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      acceptedByUserId: row.accepted_by_user_id
    };
  }

  async markInviteAcceptedAndUpsertMembership(input: {
    inviteId: string;
    tenantId: string;
    userId: string;
    role: MembershipRole;
    now: Date;
  }): Promise<"accepted_now" | "already_accepted_same_user" | "already_accepted_different_user"> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const acceptance = await client.query<{ accepted_by_user_id: string | null }>(
        `
          update invites
          set accepted_at = $2::timestamptz,
              accepted_by_user_id = $3
          where id = $1
            and accepted_at is null
          returning accepted_by_user_id
        `,
        [input.inviteId, input.now.toISOString(), input.userId]
      );

      let outcome:
        | "accepted_now"
        | "already_accepted_same_user"
        | "already_accepted_different_user" = "accepted_now";
      if ((acceptance.rowCount ?? 0) === 0) {
        const existing = await client.query<{ accepted_by_user_id: string | null }>(
          `
            select accepted_by_user_id
            from invites
            where id = $1
            for update
          `,
          [input.inviteId]
        );

        const existingRow = existing.rows.at(0);
        if (!existingRow) {
          throw new Error("Invite no longer exists");
        }

        if (existingRow.accepted_by_user_id === input.userId) {
          outcome = "already_accepted_same_user";
        } else {
          outcome = "already_accepted_different_user";
        }
      }

      if (outcome !== "already_accepted_different_user") {
        await client.query(
          `
            insert into memberships (
              tenant_id,
              user_id,
              role,
              status,
              created_at,
              updated_at
            ) values ($1, $2, $3, 'active', $4::timestamptz, $4::timestamptz)
            on conflict (tenant_id, user_id)
            do update set
              role = excluded.role,
              status = 'active',
              updated_at = excluded.updated_at
          `,
          [input.tenantId, input.userId, input.role, input.now.toISOString()]
        );
      }

      await client.query("commit");
      return outcome;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listUserKnownEmails(userId: string): Promise<string[]> {
    const result = await this.pool.query<{
      primary_email: string | null;
      identity_email: string | null;
      identity_upn: string | null;
    }>(
      `
        select
          u.primary_email,
          i.email as identity_email,
          i.upn as identity_upn
        from users u
        left join identities i on i.user_id = u.id
        where u.id = $1
      `,
      [userId]
    );

    const emails = new Set<string>();
    for (const row of result.rows) {
      if (row.primary_email) {
        emails.add(normalizeEmail(row.primary_email));
      }
      if (row.identity_email) {
        emails.add(normalizeEmail(row.identity_email));
      }
      if (row.identity_upn) {
        emails.add(normalizeEmail(row.identity_upn));
      }
    }

    return [...emails];
  }

  async insertAuditEvent(input: {
    eventType: string;
    actorUserId: string | null;
    tenantId: string | null;
    metadata: Record<string, unknown>;
    now: Date;
  }): Promise<void> {
    await this.pool.query(
      `
        insert into auth_audit_events (
          id,
          event_type,
          actor_user_id,
          tenant_id,
          metadata,
          occurred_at
        ) values ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
      `,
      [
        randomUUID(),
        input.eventType,
        input.actorUserId,
        input.tenantId,
        JSON.stringify(input.metadata),
        input.now.toISOString()
      ]
    );
  }

  async listAuditEvents(
    input: {
      eventType?: string;
    } = {}
  ): Promise<
    Array<{
      eventType: string;
      actorUserId: string | null;
      tenantId: string | null;
      metadata: Record<string, unknown>;
    }>
  > {
    const params: string[] = [];
    let whereClause = "";
    if (input.eventType) {
      params.push(input.eventType);
      whereClause = "where event_type = $1";
    }

    const result = await this.pool.query<{
      event_type: string;
      actor_user_id: string | null;
      tenant_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `
        select event_type, actor_user_id, tenant_id, metadata
        from auth_audit_events
        ${whereClause}
        order by occurred_at asc
      `,
      params
    );

    return result.rows.map((row) => ({
      eventType: row.event_type,
      actorUserId: row.actor_user_id,
      tenantId: row.tenant_id,
      metadata: row.metadata
    }));
  }
}

export interface AuthServiceInput {
  config: EntraAuthConfig;
  repository: AuthRepository;
  oidcClient: OidcClient;
}

export class AuthService {
  private readonly config: EntraAuthConfig;
  private readonly repository: AuthRepository;
  private readonly oidcClient: OidcClient;
  private readonly oidcStateEncryptionKey: Buffer | null;

  constructor(input: AuthServiceInput) {
    this.config = input.config;
    this.repository = input.repository;
    this.oidcClient = input.oidcClient;
    this.oidcStateEncryptionKey = parseOidcStateEncryptionKey(input.config.oidcStateEncryptionKey);
  }

  async startEntraLogin(input: {
    returnTo?: string;
    userAgent: string | undefined;
    ip: string;
    now: Date;
  }): Promise<{ redirectUrl: string; sessionToken?: string }> {
    if (this.config.authMode === "mock") {
      const mockResult = await this.startMockLogin(input);
      return {
        redirectUrl: mockResult.redirectTo,
        sessionToken: mockResult.sessionToken
      };
    }

    this.assertEntraMode();

    const state = randomToken(24);
    const nonce = randomToken(24);
    const pkceVerifier = randomToken(64);
    const codeChallenge = encodePkceChallenge(pkceVerifier);
    const encryptedPayload = encryptOidcRequestPayload({
      encryptionKey: this.requiredOidcStateEncryptionKey(),
      flow: "entra-login",
      nonce,
      pkceVerifier
    });

    const returnTo = sanitizeReturnTo(input.returnTo);
    await this.repository.createOidcRequest({
      state,
      nonceHash: hashValue(nonce),
      encryptedPayload,
      returnTo,
      now: input.now
    });

    return {
      redirectUrl: this.oidcClient.buildAuthorizeUrl({
        state,
        nonce,
        codeChallenge,
        redirectUri: this.requiredRedirectUri()
      })
    };
  }

  async startAdminConsent(input: {
    tenantHint?: string;
    returnTo?: string;
    now: Date;
  }): Promise<{ redirectUrl: string }> {
    this.assertEntraMode();

    const state = randomToken(24);
    const nonce = randomToken(24);
    const returnTo = sanitizeReturnTo(input.returnTo) || "/";
    const encryptedPayload = encryptOidcRequestPayload({
      encryptionKey: this.requiredOidcStateEncryptionKey(),
      flow: "admin-consent",
      nonce,
      pkceVerifier: ADMIN_CONSENT_REQUEST_MARKER
    });

    await this.repository.createOidcRequest({
      state,
      nonceHash: hashValue(nonce),
      encryptedPayload,
      returnTo,
      now: input.now
    });

    return {
      redirectUrl: this.oidcClient.buildAdminConsentUrl({
        tenantHint: input.tenantHint,
        redirectUri: this.requiredRedirectUri(),
        state
      })
    };
  }

  async handleEntraCallback(input: {
    code?: string;
    state?: string;
    adminConsent?: string;
    tenant?: string;
    scope?: string;
    error?: string;
    errorDescription?: string;
    userAgent: string | undefined;
    ip: string;
    now: Date;
  }): Promise<{ redirectTo: string; sessionToken?: string }> {
    this.assertEntraMode();

    const state = asStringOrNull(input.state);
    const tenantHint = asStringOrNull(input.tenant);
    const hasAdminConsent = parseBooleanQueryFlag(input.adminConsent);

    let consumedStateRequest: OidcRequestRecord | null | undefined;
    let consumedStateSecrets:
      | { flow: "entra-login" | "admin-consent"; nonce: string; pkceVerifier: string }
      | null
      | undefined;
    const consumeStateRequest = async (): Promise<OidcRequestRecord | null> => {
      if (!state) {
        return null;
      }
      if (consumedStateRequest !== undefined) {
        return consumedStateRequest;
      }

      consumedStateRequest = await this.repository.consumeOidcRequest(state, input.now);
      return consumedStateRequest;
    };
    const consumeStateSecrets = async (): Promise<{
      flow: "entra-login" | "admin-consent";
      nonce: string;
      pkceVerifier: string;
    } | null> => {
      if (consumedStateSecrets !== undefined) {
        return consumedStateSecrets;
      }

      const oidcRequest = await consumeStateRequest();
      if (!oidcRequest) {
        consumedStateSecrets = null;
        return consumedStateSecrets;
      }

      consumedStateSecrets = this.decodeOidcRequestSecrets(oidcRequest);
      return consumedStateSecrets;
    };

    if (hasAdminConsent) {
      const oidcRequest = await consumeStateRequest();
      if (!oidcRequest) {
        throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
      }

      const oidcSecrets = await consumeStateSecrets();
      if (oidcSecrets?.flow !== "admin-consent") {
        throw new ApiError(400, "INVALID_CALLBACK", "Callback state does not match admin consent");
      }

      return {
        redirectTo: buildLoginRedirect({
          consent: "granted",
          returnTo: oidcRequest.returnTo,
          tenantHint
        })
      };
    }

    if (input.error) {
      const oidcRequest = state ? await consumeStateRequest() : null;
      if (state && !oidcRequest) {
        throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
      }
      const oidcSecrets = state ? await consumeStateSecrets() : null;

      await this.repository.insertAuditEvent({
        eventType: "auth.login.failure",
        actorUserId: null,
        tenantId: null,
        metadata: {
          provider: "entra",
          error: input.error,
          errorDescription: input.errorDescription ?? null
        },
        now: input.now
      });

      const lower = `${input.error} ${input.errorDescription ?? ""}`.toLowerCase();
      if (oidcSecrets?.flow === "admin-consent") {
        return {
          redirectTo: buildLoginRedirect({
            consent: "denied",
            returnTo: oidcRequest?.returnTo,
            tenantHint
          })
        };
      }

      const isConsent = lower.includes("consent") || lower.includes("aadsts65001");
      if (isConsent) {
        return {
          redirectTo: buildLoginRedirect({
            error: "admin_consent_required",
            returnTo: oidcRequest?.returnTo ?? "/",
            tenantHint
          })
        };
      }

      throw new ApiError(401, "OIDC_CALLBACK_ERROR", input.errorDescription || input.error);
    }

    if (!input.code || !state) {
      throw new ApiError(400, "INVALID_CALLBACK", "Missing callback code or state");
    }

    const oidcRequest = await consumeStateRequest();
    if (!oidcRequest) {
      throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
    }
    const oidcSecrets = await consumeStateSecrets();
    if (!oidcSecrets) {
      throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
    }
    if (oidcSecrets.flow === "admin-consent") {
      throw new ApiError(400, "INVALID_CALLBACK", "Missing admin consent result");
    }

    const idToken = await this.oidcClient.exchangeCodeForIdToken({
      code: input.code,
      redirectUri: this.requiredRedirectUri(),
      codeVerifier: oidcSecrets.pkceVerifier
    });

    const claims = await this.oidcClient.verifyIdToken({
      idToken,
      expectedNonce: oidcSecrets.nonce
    });

    if (!this.isAllowedTenant(claims.tid)) {
      await this.repository.insertAuditEvent({
        eventType: "auth.login.failure",
        actorUserId: null,
        tenantId: null,
        metadata: {
          provider: "entra",
          reason: "tenant_not_allowed",
          entraTid: claims.tid,
          entraOid: claims.oid
        },
        now: input.now
      });

      throw new ApiError(
        403,
        "ENTRA_TENANT_NOT_ALLOWED",
        "Your Microsoft Entra tenant is not allowed to sign in"
      );
    }

    const user = await this.repository.findOrCreateUserForIdentity(claims);

    const sessionToken = randomToken(32);
    const sessionTokenHash = hashValue(sessionToken);
    const userAgentHash = asStringOrNull(input.userAgent)
      ? hashValue(input.userAgent as string)
      : null;
    const ipHash = hashValue(input.ip);
    const expiresAt = nowPlusSeconds(input.now, this.config.sessionTtlSeconds);

    await this.repository.createSession({
      userId: user.id,
      sessionTokenHash,
      userAgentHash,
      ipHash,
      now: input.now,
      expiresAt
    });

    await this.repository.insertAuditEvent({
      eventType: "auth.login.success",
      actorUserId: user.id,
      tenantId: null,
      metadata: {
        provider: "entra",
        entraTid: claims.tid,
        entraOid: claims.oid
      },
      now: input.now
    });

    const memberships = await this.repository.listMemberships(user.id);
    const redirectTo =
      oidcRequest.returnTo && this.canVisitReturnTo(oidcRequest.returnTo, memberships)
        ? oidcRequest.returnTo
        : this.pickPostLoginRoute(memberships);

    return {
      redirectTo,
      sessionToken
    };
  }

  async readAuthMe(input: { sessionToken: string | null; now: Date }): Promise<AuthMeResponse> {
    const context = await this.requireSession(input.sessionToken, input.now);
    const memberships = await this.repository.listMemberships(context.userId);

    return AuthMeResponseSchema.parse({
      authenticated: true,
      user: {
        id: context.userId,
        primaryEmail: context.primaryEmail,
        displayName: context.displayName
      },
      memberships: memberships.map((membership) => ({
        tenantId: membership.tenantId,
        tenantSlug: membership.tenantSlug,
        tenantName: membership.tenantName,
        role: membership.role,
        status: membership.status
      })),
      lastActiveTenantSlug: null
    });
  }

  async logout(input: { sessionToken: string | null; now: Date }): Promise<void> {
    if (!input.sessionToken) {
      return;
    }

    await this.repository.revokeSessionByTokenHash(hashValue(input.sessionToken), input.now);
  }

  async createTenant(input: {
    sessionToken: string | null;
    now: Date;
    request: TenantCreateRequest;
  }): Promise<{
    tenant: TenantRecord;
    membership: { role: MembershipRole; status: "active" | "invited" | "disabled" };
  }> {
    const context = await this.requireSession(input.sessionToken, input.now);
    const request = TenantCreateRequestSchema.parse(input.request);

    try {
      const created = await this.repository.createTenant({
        userId: context.userId,
        request,
        now: input.now
      });

      await this.repository.insertAuditEvent({
        eventType: "tenant.create",
        actorUserId: context.userId,
        tenantId: created.tenant.id,
        metadata: {
          tenantSlug: created.tenant.slug
        },
        now: input.now
      });

      return {
        tenant: created.tenant,
        membership: {
          role: created.membership.role,
          status: created.membership.status
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("tenants_unique_slug")) {
        throw new ApiError(409, "TENANT_SLUG_CONFLICT", "Tenant slug already exists");
      }
      throw error;
    }
  }

  async readTenant(input: {
    sessionToken: string | null;
    tenantSlug: string;
    now: Date;
  }): Promise<{ tenant: TenantRecord }> {
    const context = await this.requireSession(input.sessionToken, input.now);

    const membership = await this.repository.requireTenantMembership({
      tenantSlug: input.tenantSlug,
      userId: context.userId
    });

    if (!membership || membership.membershipStatus !== "active") {
      throw new ApiError(403, "TENANT_FORBIDDEN", "You are not a member of this tenant");
    }

    const tenant = await this.repository.findTenantBySlug(input.tenantSlug);
    if (!tenant) {
      throw new ApiError(404, "TENANT_NOT_FOUND", "Tenant not found");
    }

    return { tenant };
  }

  async listTenantMembers(input: {
    sessionToken: string | null;
    tenantSlug: string;
    now: Date;
  }): Promise<{
    members: Array<{
      userId: string;
      primaryEmail: string | null;
      displayName: string | null;
      role: MembershipRole;
      status: "active" | "invited" | "disabled";
    }>;
  }> {
    const context = await this.requireSession(input.sessionToken, input.now);

    const membership = await this.repository.requireTenantMembership({
      tenantSlug: input.tenantSlug,
      userId: context.userId
    });

    if (!membership || membership.membershipStatus !== "active") {
      throw new ApiError(403, "TENANT_FORBIDDEN", "You are not a member of this tenant");
    }

    const members = await this.repository.listTenantMembers(membership.tenantId);
    return { members };
  }

  async createTenantInvite(input: {
    sessionToken: string | null;
    tenantSlug: string;
    now: Date;
    request: TenantInviteCreateRequest;
  }): Promise<{ inviteId: string; expiresAt: string; token: string }> {
    const context = await this.requireSession(input.sessionToken, input.now);
    const request = TenantInviteCreateRequestSchema.parse(input.request);

    const membership = await this.repository.requireTenantMembership({
      tenantSlug: input.tenantSlug,
      userId: context.userId
    });

    if (!membership || membership.membershipStatus !== "active") {
      throw new ApiError(403, "TENANT_FORBIDDEN", "You are not a member of this tenant");
    }

    if (!(membership.membershipRole === "owner" || membership.membershipRole === "admin")) {
      throw new ApiError(403, "INVITE_FORBIDDEN", "Only owner/admin can invite users");
    }

    const token = randomToken(24);
    const tokenHash = hashValue(token);
    const expiresInDays = request.expiresInDays ?? 7;
    const expiresAt = nowPlusSeconds(input.now, expiresInDays * 24 * 60 * 60);

    const created = await this.repository.createInvite({
      tenantId: membership.tenantId,
      emailNormalized: normalizeEmail(request.email),
      role: request.role,
      tokenHash,
      invitedByUserId: context.userId,
      expiresAt
    });

    await this.repository.insertAuditEvent({
      eventType: "tenant.invite.create",
      actorUserId: context.userId,
      tenantId: membership.tenantId,
      metadata: {
        inviteId: created.inviteId,
        role: request.role,
        email: normalizeEmail(request.email)
      },
      now: input.now
    });

    return {
      inviteId: created.inviteId,
      expiresAt: created.expiresAt,
      token
    };
  }

  async acceptTenantInvite(input: {
    sessionToken: string | null;
    tenantSlug: string;
    inviteToken: string;
    now: Date;
  }): Promise<{
    joined: boolean;
    tenantSlug: string;
    role: MembershipRole;
    status: "active" | "invited" | "disabled";
  }> {
    const context = await this.requireSession(input.sessionToken, input.now);
    const invite = await this.repository.findInviteByToken({
      tenantSlug: input.tenantSlug,
      tokenHash: hashValue(input.inviteToken)
    });

    if (!invite) {
      throw new ApiError(404, "INVITE_NOT_FOUND", "Invite not found");
    }

    if (new Date(invite.expiresAt).getTime() <= input.now.getTime()) {
      throw new ApiError(410, "INVITE_EXPIRED", "Invite has expired");
    }

    const alreadyAcceptedByCurrentUser =
      invite.acceptedAt !== null && invite.acceptedByUserId === context.userId;
    if (!alreadyAcceptedByCurrentUser) {
      const userEmails = await this.repository.listUserKnownEmails(context.userId);
      if (!userEmails.includes(invite.emailNormalized)) {
        throw new ApiError(
          403,
          "INVITE_EMAIL_MISMATCH",
          "Invite email does not match authenticated user"
        );
      }
    }

    const acceptResult = await this.repository.markInviteAcceptedAndUpsertMembership({
      inviteId: invite.id,
      tenantId: invite.tenantId,
      userId: context.userId,
      role: invite.role,
      now: input.now
    });

    if (acceptResult === "already_accepted_different_user") {
      throw new ApiError(
        409,
        "INVITE_ALREADY_ACCEPTED",
        "Invite has already been accepted by another user"
      );
    }

    await this.repository.insertAuditEvent({
      eventType: "tenant.invite.accept",
      actorUserId: context.userId,
      tenantId: invite.tenantId,
      metadata: {
        inviteId: invite.id,
        tenantSlug: invite.tenantSlug
      },
      now: input.now
    });

    return {
      joined: true,
      tenantSlug: invite.tenantSlug,
      role: invite.role,
      status: "active"
    };
  }

  createSessionCookie(sessionToken: string): string {
    const maxAge = this.config.sessionTtlSeconds;
    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  }

  clearSessionCookie(): string {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }

  pickPostLoginRoute(memberships: MembershipRecord[]): string {
    const activeMemberships = memberships.filter((membership) => membership.status === "active");
    const onlyMembership = activeMemberships.at(0);
    if (activeMemberships.length === 1 && onlyMembership) {
      return `/t/${onlyMembership.tenantSlug}`;
    }

    if (activeMemberships.length > 1) {
      return "/workspaces";
    }

    return "/workspaces?onboarding=1";
  }

  private canVisitReturnTo(returnTo: string, memberships: MembershipRecord[]): boolean {
    if (returnTo === "/" || returnTo === "/login") {
      return false;
    }

    const match = returnTo.match(/^\/t\/([a-z0-9-]+)(?:\/|$)/u);
    if (!match) {
      return true;
    }

    const slug = match[1];
    return memberships.some(
      (membership) => membership.tenantSlug === slug && membership.status === "active"
    );
  }

  private async startMockLogin(input: {
    returnTo?: string;
    userAgent: string | undefined;
    ip: string;
    now: Date;
  }): Promise<{ redirectTo: string; sessionToken: string }> {
    const tid = asStringOrNull(process.env.MOCK_AUTH_TENANT_ID) ?? DEFAULT_MOCK_ENTRA_TID;
    const oid = asStringOrNull(process.env.MOCK_AUTH_USER_OID) ?? DEFAULT_MOCK_ENTRA_OID;
    const email = asStringOrNull(process.env.MOCK_AUTH_EMAIL) ?? DEFAULT_MOCK_EMAIL;
    const displayName = asStringOrNull(process.env.MOCK_AUTH_NAME) ?? DEFAULT_MOCK_DISPLAY_NAME;

    const user = await this.repository.findOrCreateUserForIdentity({
      tid,
      oid,
      iss: `https://mock.local/${tid}/v2.0`,
      email,
      upn: email,
      name: displayName
    });

    const sessionToken = randomToken(32);
    const sessionTokenHash = hashValue(sessionToken);
    const normalizedUserAgent = asStringOrNull(input.userAgent);
    const userAgentHash = normalizedUserAgent ? hashValue(normalizedUserAgent) : null;
    const ipHash = hashValue(input.ip);
    const expiresAt = nowPlusSeconds(input.now, this.config.sessionTtlSeconds);

    await this.repository.createSession({
      userId: user.id,
      sessionTokenHash,
      userAgentHash,
      ipHash,
      now: input.now,
      expiresAt
    });

    await this.repository.insertAuditEvent({
      eventType: "auth.login.success",
      actorUserId: user.id,
      tenantId: null,
      metadata: {
        provider: "mock"
      },
      now: input.now
    });

    const memberships = await this.repository.listMemberships(user.id);
    const returnTo = sanitizeReturnTo(input.returnTo);
    const redirectTo =
      returnTo && this.canVisitReturnTo(returnTo, memberships)
        ? returnTo
        : this.pickPostLoginRoute(memberships);

    return {
      redirectTo,
      sessionToken
    };
  }

  private async requireSession(
    sessionToken: string | null,
    now: Date
  ): Promise<{ userId: string; primaryEmail: string | null; displayName: string | null }> {
    if (!sessionToken) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const session = await this.repository.readSessionByTokenHash(hashValue(sessionToken), now);
    if (!session) {
      throw new ApiError(401, "UNAUTHORIZED", "Authentication required");
    }

    const idleCutoff = nowPlusSeconds(now, -this.config.sessionIdleTtlSeconds);
    if (new Date(session.lastSeenAt).getTime() <= idleCutoff.getTime()) {
      await this.repository.revokeSessionByTokenHash(hashValue(sessionToken), now);
      throw new ApiError(401, "SESSION_IDLE_TIMEOUT", "Session expired due to inactivity");
    }

    await this.repository.touchSession(session.id, now);

    return {
      userId: session.userId,
      primaryEmail: asValidEmailOrNull(session.primaryEmail),
      displayName: session.displayName
    };
  }

  private requiredRedirectUri(): string {
    const redirectUri = asStringOrNull(this.config.redirectUri);
    if (!redirectUri) {
      throw new ApiError(503, "ENTRA_CONFIG_REQUIRED", "ENTRA_REDIRECT_URI is required");
    }

    return redirectUri;
  }

  private requiredOidcStateEncryptionKey(): Buffer {
    if (!this.oidcStateEncryptionKey) {
      throw new ApiError(
        503,
        "ENTRA_CONFIG_REQUIRED",
        "AUTH_OIDC_STATE_ENCRYPTION_KEY is required when Entra login is enabled"
      );
    }

    return this.oidcStateEncryptionKey;
  }

  private decodeOidcRequestSecrets(oidcRequest: OidcRequestRecord): {
    flow: "entra-login" | "admin-consent";
    nonce: string;
    pkceVerifier: string;
  } {
    let decoded: { flow: "entra-login" | "admin-consent"; nonce: string; pkceVerifier: string };
    try {
      decoded = decryptOidcRequestPayload({
        encryptionKey: this.requiredOidcStateEncryptionKey(),
        encodedPayload: oidcRequest.encryptedPayload
      });
    } catch {
      throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
    }

    if (hashValue(decoded.nonce) !== oidcRequest.nonceHash) {
      throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
    }

    return decoded;
  }

  private assertEntraMode(): void {
    if (this.config.authMode !== "entra") {
      throw new ApiError(503, "ENTRA_LOGIN_DISABLED", "Microsoft Entra login is disabled");
    }

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new ApiError(503, "ENTRA_CONFIG_REQUIRED", "Entra client configuration is incomplete");
    }

    if (!this.oidcStateEncryptionKey) {
      throw new ApiError(
        503,
        "ENTRA_CONFIG_REQUIRED",
        "AUTH_OIDC_STATE_ENCRYPTION_KEY is required when Entra login is enabled"
      );
    }
  }

  private isAllowedTenant(tid: string): boolean {
    if (this.config.allowedTenantIds.length === 0) {
      return true;
    }

    return this.config.allowedTenantIds.includes(tid);
  }
}

export function buildEntraAuthConfig(env: NodeJS.ProcessEnv): EntraAuthConfig {
  const rawAuthMode = asStringOrNull(env.AUTH_MODE)?.toLowerCase();
  if (rawAuthMode && rawAuthMode !== "mock" && rawAuthMode !== "entra") {
    throw new Error(`AUTH_MODE must be 'mock' or 'entra' (received '${rawAuthMode}')`);
  }

  const authMode: AuthMode = rawAuthMode === "entra" ? "entra" : "mock";
  const webBaseUrl = asStringOrNull(env.WEB_BASE_URL) ?? "http://localhost:3000";
  const defaultRedirectUri = `${webBaseUrl.replace(/\/+$/u, "")}/v1/auth/entra/callback`;

  const parseSeconds = (value: string | undefined, fallback: number): number => {
    if (!value || value.trim().length === 0) {
      return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return fallback;
    }

    return parsed;
  };

  const parseCommaList = (value: string | undefined): string[] => {
    if (!value) {
      return [];
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  };

  return {
    authMode,
    clientId: asStringOrNull(env.ENTRA_CLIENT_ID) ?? undefined,
    clientSecret: asStringOrNull(env.ENTRA_CLIENT_SECRET) ?? undefined,
    oidcStateEncryptionKey: asStringOrNull(env.AUTH_OIDC_STATE_ENCRYPTION_KEY) ?? undefined,
    redirectUri: asStringOrNull(env.ENTRA_REDIRECT_URI) ?? defaultRedirectUri,
    authorityHost: asStringOrNull(env.ENTRA_AUTHORITY_HOST) ?? "https://login.microsoftonline.com",
    tenantSegment: asStringOrNull(env.ENTRA_TENANT_SEGMENT) ?? "organizations",
    allowedTenantIds: parseCommaList(env.ENTRA_ALLOWED_TENANT_IDS),
    scope: asStringOrNull(env.ENTRA_SCOPE) ?? DEFAULT_OIDC_SCOPE,
    webBaseUrl,
    sessionTtlSeconds: parseSeconds(env.AUTH_SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS),
    sessionIdleTtlSeconds: parseSeconds(
      env.AUTH_SESSION_IDLE_TTL_SECONDS,
      DEFAULT_SESSION_IDLE_TTL_SECONDS
    )
  };
}

export function readSessionTokenFromCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const pieces = cookieHeader.split(";");
  for (const piece of pieces) {
    const [rawName, ...rest] = piece.trim().split("=");
    if (rawName !== SESSION_COOKIE_NAME) {
      continue;
    }

    const value = rest.join("=");
    return value ? decodeURIComponent(value) : null;
  }

  return null;
}

export function buildDefaultAuthService(
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv
): {
  service: AuthService | null;
  close: () => Promise<void>;
} {
  if (!databaseUrl) {
    return {
      service: null,
      close: async () => {}
    };
  }

  const config = buildEntraAuthConfig(env);
  const repository = new AuthRepository(databaseUrl);
  const disabledClient: OidcClient = {
    buildAuthorizeUrl: () => "",
    buildAdminConsentUrl: () => "",
    exchangeCodeForIdToken: async () => {
      throw new ApiError(503, "ENTRA_CONFIG_REQUIRED", "Entra client configuration is incomplete");
    },
    verifyIdToken: async () => {
      throw new ApiError(503, "ENTRA_CONFIG_REQUIRED", "Entra client configuration is incomplete");
    }
  };

  const oidcClient =
    config.authMode === "entra" && config.clientId && config.clientSecret
      ? new EntraOidcClient({
          authorityHost: config.authorityHost,
          tenantSegment: config.tenantSegment,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          scope: config.scope
        })
      : disabledClient;

  return {
    service: new AuthService({
      config,
      repository,
      oidcClient
    }),
    close: async () => {
      await repository.close();
    }
  };
}

export function parseAuthError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message
    };
  }

  return {
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected server error"
  };
}

export function parseActorContext(headers: {
  forwardedFor?: string;
  remoteAddress?: string;
  userAgent?: string;
}): { ip: string; userAgent: string | undefined } {
  return {
    ip: extractClientIp(headers.forwardedFor, headers.remoteAddress),
    userAgent: headers.userAgent
  };
}
