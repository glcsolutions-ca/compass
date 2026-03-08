import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  AuthMeResponseSchema,
  type AuthMeResponse,
  type WorkspaceCreateRequest
} from "@compass/contracts";
import {
  ADMIN_CONSENT_REQUEST_MARKER,
  DEFAULT_MOCK_DISPLAY_NAME,
  DEFAULT_MOCK_EMAIL,
  DEFAULT_MOCK_ENTRA_OID,
  DEFAULT_MOCK_ENTRA_TID,
  DESKTOP_HANDOFF_TTL_SECONDS,
  OIDC_REQUEST_TTL_SECONDS,
  SESSION_COOKIE_NAME,
  type AuthClient,
  type EntraAuthConfig,
  type DesktopHandoffRecord,
  type InviteRecord,
  type OidcClient,
  type OidcIdTokenClaims,
  type OidcRequestRecord,
  type OidcRequestSecrets,
  type OrganizationMembershipRecord,
  type SessionRecord,
  type UserRecord,
  type WorkspaceMembershipCheck,
  type WorkspaceMembershipRecord,
  type WorkspaceRecord,
  ApiError,
  asStringOrNull,
  asValidEmailOrNull,
  buildLoginRedirect,
  buildPersonalTenantName,
  buildPersonalTenantSlug,
  decryptOidcRequestPayload,
  encodePkceChallenge,
  encryptOidcRequestPayload,
  hashValue,
  normalizeEmail,
  nowPlusSeconds,
  parseBooleanQueryFlag,
  parseOidcStateEncryptionKey,
  randomToken,
  resolvePrimaryEmail,
  sanitizeReturnTo,
  toOrganizationRole,
  toWorkspaceRole
} from "./auth-core.js";
import { buildEntraAuthConfig } from "./auth-config.js";
import { EntraOidcClient } from "./auth-oidc-client.js";

export {
  SESSION_COOKIE_NAME,
  type AuthClient,
  type AuthMode,
  type EntraAuthConfig,
  type OidcClient,
  type OidcIdTokenClaims,
  ApiError,
  __internalAuthService
} from "./auth-core.js";
export { EntraOidcClient } from "./auth-oidc-client.js";
export {
  buildEntraAuthConfig,
  parseActorContext,
  parseAuthError,
  readSessionTokenFromCookie
} from "./auth-config.js";

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
        auth_desktop_handoffs,
        auth_oidc_requests,
        workspace_invites,
        workspace_memberships,
        workspaces,
        organization_memberships,
        organizations,
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

  async createDesktopHandoff(input: {
    handoffToken: string;
    userId: string;
    redirectTo: string;
    now: Date;
  }): Promise<void> {
    const expiresAt = nowPlusSeconds(input.now, DESKTOP_HANDOFF_TTL_SECONDS).toISOString();

    await this.pool.query(
      `
        insert into auth_desktop_handoffs (
          id,
          handoff_token_hash,
          user_id,
          redirect_to,
          expires_at,
          created_at
        ) values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
      `,
      [
        randomUUID(),
        hashValue(input.handoffToken),
        input.userId,
        input.redirectTo,
        expiresAt,
        input.now.toISOString()
      ]
    );
  }

  async consumeDesktopHandoff(
    handoffToken: string,
    now: Date
  ): Promise<DesktopHandoffRecord | null> {
    const result = await this.pool.query<{
      id: string;
      user_id: string;
      redirect_to: string;
    }>(
      `
        update auth_desktop_handoffs
        set consumed_at = $2::timestamptz
        where handoff_token_hash = $1
          and consumed_at is null
          and expires_at > $2::timestamptz
        returning id, user_id, redirect_to
      `,
      [hashValue(handoffToken), now.toISOString()]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      redirectTo: row.redirect_to
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

  async listOrganizationMemberships(userId: string): Promise<OrganizationMembershipRecord[]> {
    const result = await this.pool.query<{
      organization_id: string;
      organization_slug: string;
      organization_name: string;
      role: string;
      status: "active" | "invited" | "disabled";
    }>(
      `
        select
          om.organization_id,
          o.slug as organization_slug,
          o.name as organization_name,
          om.role,
          om.status
        from organization_memberships om
        join organizations o on o.id = om.organization_id
        where om.user_id = $1
        order by
          case when o.kind = 'personal' then 0 else 1 end asc,
          o.slug asc
      `,
      [userId]
    );

    return result.rows.map((row) => ({
      organizationId: row.organization_id,
      organizationSlug: row.organization_slug,
      organizationName: row.organization_name,
      role: toOrganizationRole(row.role),
      status: row.status
    }));
  }

  async listWorkspaceMemberships(userId: string): Promise<WorkspaceMembershipRecord[]> {
    const result = await this.pool.query<{
      workspace_id: string;
      workspace_slug: string;
      workspace_name: string;
      organization_id: string;
      organization_slug: string;
      organization_name: string;
      is_personal: boolean;
      role: string;
      status: "active" | "invited" | "disabled";
    }>(
      `
        select
          wm.workspace_id,
          w.slug as workspace_slug,
          w.name as workspace_name,
          w.organization_id,
          o.slug as organization_slug,
          o.name as organization_name,
          w.is_personal,
          wm.role,
          wm.status
        from workspace_memberships wm
        join workspaces w on w.id = wm.workspace_id
        join organizations o on o.id = w.organization_id
        where wm.user_id = $1
        order by
          case when w.is_personal then 0 else 1 end asc,
          w.slug asc
      `,
      [userId]
    );

    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      workspaceSlug: row.workspace_slug,
      workspaceName: row.workspace_name,
      organizationId: row.organization_id,
      organizationSlug: row.organization_slug,
      organizationName: row.organization_name,
      isPersonal: row.is_personal,
      role: toWorkspaceRole(row.role),
      status: row.status
    }));
  }

  private async readLockedPersonalWorkspace(
    client: PoolClient,
    userId: string
  ): Promise<{
    organizationId: string;
    organizationSlug: string;
    workspaceId: string;
    workspaceSlug: string;
  } | null> {
    const existing = await client.query<{
      organization_id: string;
      organization_slug: string;
      workspace_id: string;
      workspace_slug: string;
    }>(
      `
        select
          o.id as organization_id,
          o.slug as organization_slug,
          w.id as workspace_id,
          w.slug as workspace_slug
        from organizations o
        join workspaces w on w.organization_id = o.id and w.is_personal = true
        where o.kind = 'personal'
          and o.owner_user_id = $1
        limit 1
        for update of o, w
      `,
      [userId]
    );

    const row = existing.rows[0];
    if (!row) {
      return null;
    }

    return {
      organizationId: row.organization_id,
      organizationSlug: row.organization_slug,
      workspaceId: row.workspace_id,
      workspaceSlug: row.workspace_slug
    };
  }

  private isExpectedUniqueConflict(error: unknown, keys: readonly string[]): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return keys.some((key) => message.includes(key));
  }

  private async insertPersonalOrganizationIfMissing(input: {
    client: PoolClient;
    userId: string;
    displayName: string | null;
    primaryEmail: string | null;
    nowIso: string;
  }): Promise<void> {
    const createdId = randomUUID();
    const createdSlug = buildPersonalTenantSlug(input.userId);
    const createdName = buildPersonalTenantName({
      displayName: input.displayName,
      primaryEmail: input.primaryEmail
    });

    try {
      await input.client.query(
        `
          insert into organizations (
            id,
            slug,
            name,
            status,
            kind,
            owner_user_id,
            created_at,
            updated_at
          ) values (
            $1,
            $2,
            $3,
            'active',
            'personal',
            $4,
            $5::timestamptz,
            $5::timestamptz
          )
        `,
        [createdId, createdSlug, createdName, input.userId, input.nowIso]
      );
    } catch (error) {
      if (
        !this.isExpectedUniqueConflict(error, [
          "organizations_owner_user_personal_uidx",
          "organizations_unique_slug"
        ])
      ) {
        throw error;
      }
    }
  }

  private async readLockedPersonalOrganization(
    client: PoolClient,
    userId: string
  ): Promise<{ id: string; slug: string; name: string }> {
    const resolvedOrganization = await client.query<{ id: string; slug: string; name: string }>(
      `
        select id, slug, name
        from organizations
        where kind = 'personal'
          and owner_user_id = $1
        limit 1
        for update
      `,
      [userId]
    );

    const organizationRow = resolvedOrganization.rows[0];
    if (!organizationRow) {
      throw new Error("Unable to resolve personal organization");
    }

    return organizationRow;
  }

  private async insertPersonalWorkspaceIfMissing(input: {
    client: PoolClient;
    organizationId: string;
    organizationSlug: string;
    organizationName: string;
    nowIso: string;
  }): Promise<void> {
    try {
      await input.client.query(
        `
          insert into workspaces (
            id,
            organization_id,
            slug,
            name,
            status,
            is_personal,
            created_at,
            updated_at
          ) values (
            $1,
            $2,
            $3,
            $4,
            'active',
            true,
            $5::timestamptz,
            $5::timestamptz
          )
        `,
        [
          input.organizationId,
          input.organizationId,
          input.organizationSlug,
          input.organizationName,
          input.nowIso
        ]
      );
    } catch (error) {
      if (
        !this.isExpectedUniqueConflict(error, [
          "workspaces_unique_slug",
          "workspaces_organization_personal_uidx"
        ])
      ) {
        throw error;
      }
    }
  }

  private async readLockedPersonalWorkspaceByOrganization(
    client: PoolClient,
    organizationId: string
  ): Promise<{ id: string; slug: string }> {
    const resolvedWorkspace = await client.query<{ id: string; slug: string }>(
      `
        select id, slug
        from workspaces
        where organization_id = $1
          and is_personal = true
        limit 1
        for update
      `,
      [organizationId]
    );

    const workspaceRow = resolvedWorkspace.rows[0];
    if (!workspaceRow) {
      throw new Error("Unable to resolve personal workspace");
    }

    return workspaceRow;
  }

  private async ensurePersonalMemberships(input: {
    client: PoolClient;
    organizationId: string;
    workspaceId: string;
    userId: string;
    nowIso: string;
  }): Promise<void> {
    await input.client.query(
      `
        insert into organization_memberships (
          organization_id,
          user_id,
          role,
          status,
          created_at,
          updated_at
        ) values (
          $1,
          $2,
          'owner',
          'active',
          $3::timestamptz,
          $3::timestamptz
        )
        on conflict (organization_id, user_id)
        do update set
          role = excluded.role,
          status = 'active',
          updated_at = excluded.updated_at
      `,
      [input.organizationId, input.userId, input.nowIso]
    );

    await input.client.query(
      `
        insert into workspace_memberships (
          workspace_id,
          user_id,
          role,
          status,
          created_at,
          updated_at
        ) values (
          $1,
          $2,
          'admin',
          'active',
          $3::timestamptz,
          $3::timestamptz
        )
        on conflict (workspace_id, user_id)
        do update set
          role = excluded.role,
          status = 'active',
          updated_at = excluded.updated_at
      `,
      [input.workspaceId, input.userId, input.nowIso]
    );
  }

  private async resolveOrCreatePersonalWorkspace(input: {
    client: PoolClient;
    userId: string;
    displayName: string | null;
    primaryEmail: string | null;
    nowIso: string;
  }): Promise<{
    organizationId: string;
    organizationSlug: string;
    workspaceId: string;
    workspaceSlug: string;
  }> {
    const existing = await this.readLockedPersonalWorkspace(input.client, input.userId);
    if (existing) {
      return existing;
    }

    await this.insertPersonalOrganizationIfMissing({
      client: input.client,
      userId: input.userId,
      displayName: input.displayName,
      primaryEmail: input.primaryEmail,
      nowIso: input.nowIso
    });
    const organizationRow = await this.readLockedPersonalOrganization(input.client, input.userId);
    await this.insertPersonalWorkspaceIfMissing({
      client: input.client,
      organizationId: organizationRow.id,
      organizationSlug: organizationRow.slug,
      organizationName: organizationRow.name,
      nowIso: input.nowIso
    });
    const workspaceRow = await this.readLockedPersonalWorkspaceByOrganization(
      input.client,
      organizationRow.id
    );

    return {
      organizationId: organizationRow.id,
      organizationSlug: organizationRow.slug,
      workspaceId: workspaceRow.id,
      workspaceSlug: workspaceRow.slug
    };
  }

  async ensurePersonalWorkspace(input: {
    userId: string;
    now: Date;
    displayName: string | null;
    primaryEmail: string | null;
  }): Promise<{
    organizationId: string;
    organizationSlug: string;
    workspaceId: string;
    workspaceSlug: string;
  }> {
    const client = await this.pool.connect();
    const nowIso = input.now.toISOString();

    try {
      await client.query("begin");

      const resolved = await this.resolveOrCreatePersonalWorkspace({
        client,
        userId: input.userId,
        displayName: input.displayName,
        primaryEmail: input.primaryEmail,
        nowIso
      });
      await this.ensurePersonalMemberships({
        client,
        organizationId: resolved.organizationId,
        workspaceId: resolved.workspaceId,
        userId: input.userId,
        nowIso
      });

      await client.query("commit");
      return resolved;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createWorkspace(input: {
    userId: string;
    request: WorkspaceCreateRequest;
    now: Date;
  }): Promise<{
    workspace: WorkspaceRecord;
    membership: { role: "admin" | "member"; status: "active" | "invited" | "disabled" };
  }> {
    const client = await this.pool.connect();
    const nowIso = input.now.toISOString();

    try {
      await client.query("begin");

      const homeOrganization = await client.query<{ id: string; slug: string; name: string }>(
        `
          select o.id, o.slug, o.name
          from organizations o
          join organization_memberships om on om.organization_id = o.id
          where om.user_id = $1
            and om.status = 'active'
            and o.kind = 'personal'
          order by o.slug asc
          limit 1
          for update
        `,
        [input.userId]
      );

      const organization = homeOrganization.rows[0];
      if (!organization) {
        throw new Error("Personal organization not found for workspace creation");
      }

      const workspaceId = randomUUID();
      await client.query(
        `
          insert into workspaces (
            id,
            organization_id,
            slug,
            name,
            status,
            is_personal,
            created_at,
            updated_at
          ) values ($1, $2, $3, $4, 'active', false, $5::timestamptz, $5::timestamptz)
        `,
        [workspaceId, organization.id, input.request.slug, input.request.name, nowIso]
      );

      await client.query(
        `
          insert into workspace_memberships (
            workspace_id,
            user_id,
            role,
            status,
            created_at,
            updated_at
          ) values ($1, $2, 'admin', 'active', $3::timestamptz, $3::timestamptz)
        `,
        [workspaceId, input.userId, nowIso]
      );

      await client.query("commit");
      return {
        workspace: {
          id: workspaceId,
          organizationId: organization.id,
          organizationSlug: organization.slug,
          organizationName: organization.name,
          slug: input.request.slug,
          name: input.request.name,
          isPersonal: false,
          status: "active"
        },
        membership: {
          role: "admin",
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

  async requireWorkspaceMembership(input: {
    workspaceSlug: string;
    userId: string;
  }): Promise<WorkspaceMembershipCheck | null> {
    const result = await this.pool.query<{
      workspace_id: string;
      workspace_slug: string;
      workspace_name: string;
      organization_id: string;
      organization_slug: string;
      organization_name: string;
      is_personal: boolean;
      membership_role: string;
      membership_status: "active" | "invited" | "disabled";
      organization_role: string;
      organization_status: "active" | "invited" | "disabled";
    }>(
      `
        select
          w.id as workspace_id,
          w.slug as workspace_slug,
          w.name as workspace_name,
          o.id as organization_id,
          o.slug as organization_slug,
          o.name as organization_name,
          w.is_personal,
          wm.role as membership_role,
          wm.status as membership_status,
          om.role as organization_role,
          om.status as organization_status
        from workspaces w
        join organizations o on o.id = w.organization_id
        join workspace_memberships wm on wm.workspace_id = w.id
        join organization_memberships om
          on om.organization_id = o.id
         and om.user_id = wm.user_id
        where w.slug = $1
          and wm.user_id = $2
      `,
      [input.workspaceSlug, input.userId]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    if (row.organization_status !== "active") {
      return null;
    }

    return {
      workspaceId: row.workspace_id,
      workspaceSlug: row.workspace_slug,
      workspaceName: row.workspace_name,
      organizationId: row.organization_id,
      organizationSlug: row.organization_slug,
      organizationName: row.organization_name,
      isPersonal: row.is_personal,
      membershipRole:
        row.membership_role === "admin" || row.organization_role === "owner"
          ? "admin"
          : toWorkspaceRole(row.membership_role),
      membershipStatus: row.membership_status
    };
  }

  async findWorkspaceBySlug(slug: string): Promise<WorkspaceRecord | null> {
    const result = await this.pool.query<{
      id: string;
      organization_id: string;
      organization_slug: string;
      organization_name: string;
      slug: string;
      name: string;
      is_personal: boolean;
      status: "active" | "disabled";
    }>(
      `
        select
          w.id,
          w.organization_id,
          o.slug as organization_slug,
          o.name as organization_name,
          w.slug,
          w.name,
          w.is_personal,
          w.status
        from workspaces w
        join organizations o on o.id = w.organization_id
        where w.slug = $1
      `,
      [slug]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationSlug: row.organization_slug,
      organizationName: row.organization_name,
      slug: row.slug,
      name: row.name,
      isPersonal: row.is_personal,
      status: row.status
    };
  }

  async listWorkspaceMembers(workspaceId: string): Promise<
    Array<{
      userId: string;
      primaryEmail: string | null;
      displayName: string | null;
      role: "admin" | "member";
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
          wm.user_id,
          u.primary_email,
          u.display_name,
          wm.role,
          wm.status
        from workspace_memberships wm
        join users u on u.id = wm.user_id
        where wm.workspace_id = $1
        order by u.primary_email asc nulls last, u.id asc
      `,
      [workspaceId]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      primaryEmail: asValidEmailOrNull(row.primary_email),
      displayName: row.display_name,
      role: toWorkspaceRole(row.role),
      status: row.status
    }));
  }

  async createWorkspaceInvite(input: {
    workspaceId: string;
    emailNormalized: string;
    role: "admin" | "member";
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: Date;
  }): Promise<{ inviteId: string; expiresAt: string }> {
    const inviteId = randomUUID();

    await this.pool.query(
      `
        insert into workspace_invites (
          id,
          workspace_id,
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
        input.workspaceId,
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

  async findWorkspaceInviteByToken(input: {
    workspaceSlug: string;
    tokenHash: string;
  }): Promise<InviteRecord | null> {
    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      workspace_slug: string;
      organization_id: string;
      email_normalized: string;
      role: string;
      expires_at: string;
      accepted_at: string | null;
      accepted_by_user_id: string | null;
    }>(
      `
        select
          wi.id,
          wi.workspace_id,
          w.slug as workspace_slug,
          w.organization_id,
          wi.email_normalized,
          wi.role,
          wi.expires_at,
          wi.accepted_at,
          wi.accepted_by_user_id
        from workspace_invites wi
        join workspaces w on w.id = wi.workspace_id
        where w.slug = $1
          and wi.token_hash = $2
      `,
      [input.workspaceSlug, input.tokenHash]
    );

    const row = result.rows.at(0);
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      workspaceSlug: row.workspace_slug,
      organizationId: row.organization_id,
      emailNormalized: row.email_normalized,
      role: toWorkspaceRole(row.role),
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      acceptedByUserId: row.accepted_by_user_id
    };
  }

  async markWorkspaceInviteAcceptedAndUpsertMembership(input: {
    inviteId: string;
    workspaceId: string;
    organizationId: string;
    userId: string;
    role: "admin" | "member";
    now: Date;
  }): Promise<"accepted_now" | "already_accepted_same_user" | "already_accepted_different_user"> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const acceptance = await client.query<{ accepted_by_user_id: string | null }>(
        `
          update workspace_invites
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
            from workspace_invites
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
            insert into organization_memberships (
              organization_id,
              user_id,
              role,
              status,
              created_at,
              updated_at
            ) values ($1, $2, 'member', 'active', $3::timestamptz, $3::timestamptz)
            on conflict (organization_id, user_id)
            do update set
              status = 'active',
              updated_at = excluded.updated_at
          `,
          [input.organizationId, input.userId, input.now.toISOString()]
        );

        await client.query(
          `
            insert into workspace_memberships (
              workspace_id,
              user_id,
              role,
              status,
              created_at,
              updated_at
            ) values ($1, $2, $3, 'active', $4::timestamptz, $4::timestamptz)
            on conflict (workspace_id, user_id)
            do update set
              role = excluded.role,
              status = 'active',
              updated_at = excluded.updated_at
          `,
          [input.workspaceId, input.userId, input.role, input.now.toISOString()]
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
    client?: AuthClient;
    redirectUri?: string;
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
      client: input.client ?? "browser",
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
        redirectUri: this.requiredRedirectUri(input.redirectUri)
      })
    };
  }

  async startAdminConsent(input: {
    tenantHint?: string;
    returnTo?: string;
    client?: AuthClient;
    redirectUri?: string;
    now: Date;
  }): Promise<{ redirectUrl: string }> {
    this.assertEntraMode();

    const state = randomToken(24);
    const nonce = randomToken(24);
    const returnTo = sanitizeReturnTo(input.returnTo) || "/";
    const encryptedPayload = encryptOidcRequestPayload({
      encryptionKey: this.requiredOidcStateEncryptionKey(),
      flow: "admin-consent",
      client: input.client ?? "browser",
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
        redirectUri: this.requiredRedirectUri(input.redirectUri),
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
    redirectUri?: string;
    userAgent: string | undefined;
    ip: string;
    now: Date;
  }): Promise<{ redirectTo: string; sessionToken?: string }> {
    this.assertEntraMode();

    const state = asStringOrNull(input.state);
    const tenantHint = asStringOrNull(input.tenant);
    const hasAdminConsent = parseBooleanQueryFlag(input.adminConsent);
    const { consumeStateRequest, consumeStateSecrets } = this.createOidcStateResolvers({
      state,
      now: input.now
    });

    if (hasAdminConsent) {
      return this.handleAdminConsentCallback({
        tenantHint,
        consumeStateRequest,
        consumeStateSecrets
      });
    }

    if (input.error) {
      return this.handleEntraErrorCallback({
        state,
        tenantHint,
        error: input.error,
        errorDescription: input.errorDescription,
        now: input.now,
        consumeStateRequest,
        consumeStateSecrets
      });
    }

    if (!input.code || !state) {
      throw new ApiError(400, "INVALID_CALLBACK", "Missing callback code or state");
    }

    return this.handleEntraLoginSuccess({
      code: input.code,
      redirectUri: input.redirectUri,
      userAgent: input.userAgent,
      ip: input.ip,
      now: input.now,
      consumeStateRequest,
      consumeStateSecrets
    });
  }

  private createOidcStateResolvers(input: { state: string | null; now: Date }): {
    consumeStateRequest: () => Promise<OidcRequestRecord | null>;
    consumeStateSecrets: () => Promise<OidcRequestSecrets | null>;
  } {
    let consumedStateRequest: OidcRequestRecord | null | undefined;
    let consumedStateSecrets: OidcRequestSecrets | null | undefined;

    const consumeStateRequest = async (): Promise<OidcRequestRecord | null> => {
      if (!input.state) {
        return null;
      }
      if (consumedStateRequest !== undefined) {
        return consumedStateRequest;
      }

      consumedStateRequest = await this.repository.consumeOidcRequest(input.state, input.now);
      return consumedStateRequest;
    };

    const consumeStateSecrets = async (): Promise<OidcRequestSecrets | null> => {
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

    return { consumeStateRequest, consumeStateSecrets };
  }

  private formatClientRedirect(input: {
    client: AuthClient | undefined;
    redirectTo: string;
  }): string {
    return input.client === "desktop"
      ? this.buildDesktopCallbackDeepLink({ nextPath: input.redirectTo })
      : input.redirectTo;
  }

  private async handleAdminConsentCallback(input: {
    tenantHint: string | null;
    consumeStateRequest: () => Promise<OidcRequestRecord | null>;
    consumeStateSecrets: () => Promise<OidcRequestSecrets | null>;
  }): Promise<{ redirectTo: string }> {
    const oidcRequest = await input.consumeStateRequest();
    if (!oidcRequest) {
      throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
    }

    const oidcSecrets = await input.consumeStateSecrets();
    if (oidcSecrets?.flow !== "admin-consent") {
      throw new ApiError(400, "INVALID_CALLBACK", "Callback state does not match admin consent");
    }

    const loginRedirect = buildLoginRedirect({
      consent: "granted",
      returnTo: oidcRequest.returnTo,
      tenantHint: input.tenantHint
    });

    return {
      redirectTo: this.formatClientRedirect({
        client: oidcSecrets.client,
        redirectTo: loginRedirect
      })
    };
  }

  private async handleEntraErrorCallback(input: {
    state: string | null;
    tenantHint: string | null;
    error: string;
    errorDescription?: string;
    now: Date;
    consumeStateRequest: () => Promise<OidcRequestRecord | null>;
    consumeStateSecrets: () => Promise<OidcRequestSecrets | null>;
  }): Promise<{ redirectTo: string }> {
    const oidcRequest = input.state ? await input.consumeStateRequest() : null;
    if (input.state && !oidcRequest) {
      throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
    }
    const oidcSecrets = input.state ? await input.consumeStateSecrets() : null;

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

    if (oidcSecrets?.flow === "admin-consent") {
      const loginRedirect = buildLoginRedirect({
        consent: "denied",
        returnTo: oidcRequest?.returnTo,
        tenantHint: input.tenantHint
      });
      return {
        redirectTo: this.formatClientRedirect({
          client: oidcSecrets.client,
          redirectTo: loginRedirect
        })
      };
    }

    const lower = `${input.error} ${input.errorDescription ?? ""}`.toLowerCase();
    const isConsent = lower.includes("consent") || lower.includes("aadsts65001");
    if (isConsent) {
      const loginRedirect = buildLoginRedirect({
        error: "admin_consent_required",
        returnTo: oidcRequest?.returnTo ?? "/",
        tenantHint: input.tenantHint
      });
      return {
        redirectTo: this.formatClientRedirect({
          client: oidcSecrets?.client,
          redirectTo: loginRedirect
        })
      };
    }

    throw new ApiError(401, "OIDC_CALLBACK_ERROR", input.errorDescription || input.error);
  }

  private async handleEntraLoginSuccess(input: {
    code: string;
    redirectUri?: string;
    userAgent: string | undefined;
    ip: string;
    now: Date;
    consumeStateRequest: () => Promise<OidcRequestRecord | null>;
    consumeStateSecrets: () => Promise<OidcRequestSecrets | null>;
  }): Promise<{ redirectTo: string; sessionToken?: string }> {
    const oidcRequest = await input.consumeStateRequest();
    if (!oidcRequest) {
      throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
    }
    const oidcSecrets = await input.consumeStateSecrets();
    if (!oidcSecrets) {
      throw new ApiError(401, "STATE_INVALID", "OIDC state is invalid or expired");
    }
    if (oidcSecrets.flow === "admin-consent") {
      throw new ApiError(400, "INVALID_CALLBACK", "Missing admin consent result");
    }

    const idToken = await this.oidcClient.exchangeCodeForIdToken({
      code: input.code,
      redirectUri: this.requiredRedirectUri(input.redirectUri),
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
    await this.repository.ensurePersonalWorkspace({
      userId: user.id,
      now: input.now,
      displayName: user.displayName,
      primaryEmail: user.primaryEmail
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

    const workspaces = await this.repository.listWorkspaceMemberships(user.id);
    const redirectTo =
      oidcRequest.returnTo && this.canVisitReturnTo(oidcRequest.returnTo, workspaces)
        ? oidcRequest.returnTo
        : this.pickPostLoginRoute(workspaces);

    if (oidcSecrets.client === "desktop") {
      const handoffToken = randomToken(24);
      await this.repository.createDesktopHandoff({
        handoffToken,
        userId: user.id,
        redirectTo,
        now: input.now
      });
      return {
        redirectTo: this.buildDesktopCallbackDeepLink({ handoffToken })
      };
    }

    const sessionToken = await this.createSessionForUser({
      userId: user.id,
      userAgent: input.userAgent,
      ip: input.ip,
      now: input.now
    });
    return {
      redirectTo,
      sessionToken
    };
  }

  async readAuthMe(input: { sessionToken: string | null; now: Date }): Promise<AuthMeResponse> {
    const context = await this.requireSession(input.sessionToken, input.now);
    await this.repository.ensurePersonalWorkspace({
      userId: context.userId,
      now: input.now,
      displayName: context.displayName,
      primaryEmail: context.primaryEmail
    });
    const organizations = await this.repository.listOrganizationMemberships(context.userId);
    const workspaces = await this.repository.listWorkspaceMemberships(context.userId);
    const firstActiveWorkspace = workspaces.find((workspace) => workspace.status === "active");
    const personalWorkspace = workspaces.find(
      (workspace) => workspace.status === "active" && workspace.isPersonal
    );

    return AuthMeResponseSchema.parse({
      authenticated: true,
      user: {
        id: context.userId,
        primaryEmail: context.primaryEmail,
        displayName: context.displayName
      },
      organizations: organizations.map((membership) => ({
        organizationId: membership.organizationId,
        organizationSlug: membership.organizationSlug,
        organizationName: membership.organizationName,
        role: membership.role,
        status: membership.status
      })),
      workspaces: workspaces.map((workspace) => ({
        id: workspace.workspaceId,
        organizationId: workspace.organizationId,
        organizationSlug: workspace.organizationSlug,
        organizationName: workspace.organizationName,
        slug: workspace.workspaceSlug,
        name: workspace.workspaceName,
        isPersonal: workspace.isPersonal,
        role: workspace.role,
        status: workspace.status
      })),
      activeWorkspaceSlug: firstActiveWorkspace?.workspaceSlug ?? null,
      personalWorkspaceSlug: personalWorkspace?.workspaceSlug ?? null
    });
  }

  async logout(input: { sessionToken: string | null; now: Date }): Promise<void> {
    if (!input.sessionToken) {
      return;
    }

    await this.repository.revokeSessionByTokenHash(hashValue(input.sessionToken), input.now);
  }

  async completeDesktopLogin(input: {
    handoffToken: string;
    userAgent: string | undefined;
    ip: string;
    now: Date;
  }): Promise<{ redirectTo: string; sessionToken: string }> {
    this.assertEntraMode();

    const handoff = await this.repository.consumeDesktopHandoff(input.handoffToken, input.now);
    if (!handoff) {
      throw new ApiError(401, "DESKTOP_HANDOFF_INVALID", "Desktop auth handoff is invalid");
    }

    const sessionToken = await this.createSessionForUser({
      userId: handoff.userId,
      userAgent: input.userAgent,
      ip: input.ip,
      now: input.now
    });

    return {
      redirectTo: sanitizeReturnTo(handoff.redirectTo) || this.pickPostLoginRoute([]),
      sessionToken
    };
  }

  async requireSessionActor(input: {
    sessionToken: string | null;
    now: Date;
  }): Promise<{ userId: string; primaryEmail: string | null; displayName: string | null }> {
    return this.requireSession(input.sessionToken, input.now);
  }

  createSessionCookie(sessionToken: string): string {
    const maxAge = this.config.sessionTtlSeconds;
    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  }

  clearSessionCookie(): string {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  }

  pickPostLoginRoute(_workspaces: WorkspaceMembershipRecord[]): string {
    return "/chat";
  }

  private canVisitReturnTo(returnTo: string, _workspaces: WorkspaceMembershipRecord[]): boolean {
    return returnTo !== "/" && returnTo !== "/login";
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
    await this.repository.ensurePersonalWorkspace({
      userId: user.id,
      now: input.now,
      displayName: user.displayName,
      primaryEmail: user.primaryEmail
    });

    const sessionToken = await this.createSessionForUser({
      userId: user.id,
      userAgent: input.userAgent,
      ip: input.ip,
      now: input.now
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

    const workspaces = await this.repository.listWorkspaceMemberships(user.id);
    const returnTo = sanitizeReturnTo(input.returnTo);
    const redirectTo =
      returnTo && this.canVisitReturnTo(returnTo, workspaces)
        ? returnTo
        : this.pickPostLoginRoute(workspaces);

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

  private requiredRedirectUri(overrideRedirectUri?: string): string {
    const redirectUri =
      asStringOrNull(overrideRedirectUri) ?? asStringOrNull(this.config.redirectUri);
    if (!redirectUri) {
      throw new ApiError(503, "ENTRA_CONFIG_REQUIRED", "ENTRA_REDIRECT_URI is required");
    }

    try {
      const parsed = new URL(redirectUri);
      if (!/^https?:$/u.test(parsed.protocol)) {
        throw new Error("unsupported redirect URI scheme");
      }

      return parsed.toString();
    } catch {
      throw new ApiError(400, "INVALID_REQUEST", "Auth redirect URI is invalid");
    }
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

  private decodeOidcRequestSecrets(oidcRequest: OidcRequestRecord): OidcRequestSecrets {
    let decoded: OidcRequestSecrets;
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

  private buildDesktopCallbackDeepLink(input: {
    handoffToken?: string;
    nextPath?: string;
  }): string {
    const url = new URL(`${this.config.desktopAuthScheme}://auth/callback`);

    if (input.handoffToken) {
      url.searchParams.set("handoff", input.handoffToken);
      return url.toString();
    }

    const nextPath = sanitizeReturnTo(input.nextPath);
    url.searchParams.set("next", nextPath || "/login");
    return url.toString();
  }

  private async createSessionForUser(input: {
    userId: string;
    userAgent: string | undefined;
    ip: string;
    now: Date;
  }): Promise<string> {
    const sessionToken = randomToken(32);
    const sessionTokenHash = hashValue(sessionToken);
    const normalizedUserAgent = asStringOrNull(input.userAgent);
    const userAgentHash = normalizedUserAgent ? hashValue(normalizedUserAgent) : null;
    const ipHash = hashValue(input.ip);
    const expiresAt = nowPlusSeconds(input.now, this.config.sessionTtlSeconds);

    await this.repository.createSession({
      userId: input.userId,
      sessionTokenHash,
      userAgentHash,
      ipHash,
      now: input.now,
      expiresAt
    });

    return sessionToken;
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

export function buildDefaultAuthService(
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv
): {
  service: AuthService | null;
  repository: AuthRepository | null;
  close: () => Promise<void>;
} {
  if (!databaseUrl) {
    return {
      service: null,
      repository: null,
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
    repository,
    close: async () => {
      await repository.close();
    }
  };
}
