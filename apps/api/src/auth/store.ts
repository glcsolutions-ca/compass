import { createHash, randomUUID } from "node:crypto";
import type { ScimGroup, ScimUser } from "@compass/contracts";
import type { ApiConfig } from "../config/index.js";
import type { ResolvedPrincipal, TenantRoleRecord, VerifiedAccessToken } from "./types.js";

interface QueryResult<Row extends Record<string, unknown>> {
  rows: Row[];
}

interface Queryable {
  query<Row extends Record<string, unknown>>(
    query: string,
    values?: unknown[]
  ): Promise<QueryResult<Row>>;
}

function hashSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function memoryIdentityKey(tenantId: string, subjectType: "user" | "app", subjectId: string) {
  return `${tenantId}:${subjectType}:${subjectId}`;
}

interface MemoryScimClient {
  tenantId: string;
  clientId: string;
  secretHash: string;
  scopes: string[];
  roles: string[];
}

export interface OAuthClientValidationResult {
  tenantId: string;
  clientId: string;
  scopes: string[];
  roles: string[];
}

export class AuthorizationStore {
  private readonly db: Queryable | null;
  private readonly config: ApiConfig;
  private readonly activeTenantIds: Set<string>;
  private readonly identityToPrincipal = new Map<string, ResolvedPrincipal>();
  private readonly principalPermissions = new Map<string, Set<string>>();
  private readonly rolesByTenant = new Map<string, TenantRoleRecord[]>();
  private readonly scimClientsByClientId = new Map<string, MemoryScimClient>();
  private readonly scimUsers = new Map<
    string,
    { id: string; externalId: string; active: boolean }
  >();
  private readonly scimGroups = new Map<
    string,
    { id: string; externalId: string; active: boolean }
  >();

  constructor(config: ApiConfig, db?: Queryable) {
    this.db = db ?? null;
    this.config = config;
    this.activeTenantIds = new Set(config.authActiveTenantIds);

    for (const assignment of config.authAssignments) {
      this.activeTenantIds.add(assignment.tenantId);
      const principalId = assignment.principalId ?? `principal_${randomUUID()}`;
      const resolved: ResolvedPrincipal = {
        principalId,
        displayName: assignment.displayName ?? assignment.subjectId
      };
      this.identityToPrincipal.set(
        memoryIdentityKey(assignment.tenantId, assignment.subjectType, assignment.subjectId),
        resolved
      );
      this.principalPermissions.set(principalId, new Set(assignment.permissions));
    }

    for (const scimClient of config.scimClients) {
      this.activeTenantIds.add(scimClient.tenantId);
      this.scimClientsByClientId.set(scimClient.clientId, {
        tenantId: scimClient.tenantId,
        clientId: scimClient.clientId,
        secretHash: hashSecret(scimClient.clientSecret),
        scopes: scimClient.scopes,
        roles: scimClient.roles
      });
    }
  }

  async isTenantActive(tenantId: string) {
    if (this.db) {
      const result = await this.db.query<{ id: string }>(
        `
          SELECT id
          FROM tenants
          WHERE id = $1
            AND status = 'active'
            AND safelist_status = 'approved'
          LIMIT 1
        `,
        [tenantId]
      );

      return result.rows.length > 0;
    }

    return this.activeTenantIds.has(tenantId);
  }

  async resolvePrincipal(token: VerifiedAccessToken): Promise<ResolvedPrincipal | null> {
    const identityKey = memoryIdentityKey(token.tenantId, token.subjectType, token.subjectId);
    if (this.db) {
      const provider = token.subjectType === "user" ? "entra-user" : "entra-app";
      const subject = token.subjectType === "user" ? token.subjectId : token.actorClientId;
      const existing = await this.db.query<{ principal_id: string; display_name: string }>(
        `
          SELECT i.principal_id, p.display_name
          FROM identities i
          JOIN principals p ON p.id = i.principal_id
          WHERE i.tenant_id = $1
            AND i.provider = $2
            AND i.subject = $3
          LIMIT 1
        `,
        [token.tenantId, provider, subject]
      );

      const existingRow = existing.rows[0];
      if (existingRow) {
        return {
          principalId: existingRow.principal_id,
          displayName: existingRow.display_name
        };
      }

      if (!this.config.authAllowJitUsers || token.subjectType !== "user") {
        return null;
      }

      const principalId = `principal_${randomUUID()}`;
      const userId = `user_${randomUUID()}`;
      const displayName =
        (typeof token.rawClaims.name === "string" ? token.rawClaims.name : null) ??
        (typeof token.rawClaims.preferred_username === "string"
          ? token.rawClaims.preferred_username
          : null) ??
        token.subjectId;
      const email =
        typeof token.rawClaims.preferred_username === "string"
          ? token.rawClaims.preferred_username
          : null;

      await this.db.query(
        `
          INSERT INTO principals (id, tenant_id, principal_type, display_name, status, created_at, updated_at)
          VALUES ($1, $2, 'user', $3, 'active', $4, $4)
        `,
        [principalId, token.tenantId, displayName, nowIso()]
      );
      await this.db.query(
        `
          INSERT INTO users (id, tenant_id, principal_id, email, display_name, active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, true, $6, $6)
        `,
        [userId, token.tenantId, principalId, email, displayName, nowIso()]
      );
      await this.db.query(
        `
          INSERT INTO identities (
            id,
            tenant_id,
            principal_id,
            provider,
            subject,
            object_id,
            claims,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, 'entra-user', $4, $4, $5::jsonb, $6, $6)
        `,
        [
          `identity_${randomUUID()}`,
          token.tenantId,
          principalId,
          token.subjectId,
          JSON.stringify(token.rawClaims),
          nowIso()
        ]
      );

      return { principalId, displayName };
    }

    const existing = this.identityToPrincipal.get(identityKey);
    if (existing) {
      return existing;
    }

    if (!this.config.authAllowJitUsers || token.subjectType !== "user") {
      return null;
    }

    const principal: ResolvedPrincipal = {
      principalId: `principal_${randomUUID()}`,
      displayName:
        (typeof token.rawClaims.name === "string" ? token.rawClaims.name : null) ?? token.subjectId
    };
    this.identityToPrincipal.set(identityKey, principal);
    return principal;
  }

  async isPrincipalAssigned(tenantId: string, principalId: string) {
    if (this.db) {
      const result = await this.db.query<{ role_id: string }>(
        `
          SELECT role_id
          FROM principal_role_bindings
          WHERE tenant_id = $1
            AND principal_id = $2
          LIMIT 1
        `,
        [tenantId, principalId]
      );
      return result.rows.length > 0;
    }

    return this.principalPermissions.has(principalId);
  }

  async getEffectivePermissions(tenantId: string, principalId: string) {
    if (this.db) {
      const result = await this.db.query<{ permission_id: string }>(
        `
          SELECT DISTINCT rp.permission_id
          FROM principal_role_bindings prb
          JOIN role_permissions rp ON rp.role_id = prb.role_id
          WHERE prb.tenant_id = $1
            AND prb.principal_id = $2
        `,
        [tenantId, principalId]
      );

      return new Set(result.rows.map((row) => row.permission_id));
    }

    return new Set(this.principalPermissions.get(principalId) ?? []);
  }

  async listRoles(tenantId: string): Promise<TenantRoleRecord[]> {
    if (this.db) {
      const result = await this.db.query<{
        id: string;
        tenant_id: string;
        name: string;
        description: string;
        is_system: boolean;
        permissions: string[] | null;
      }>(
        `
          SELECT
            r.id,
            r.tenant_id,
            r.name,
            r.description,
            r.is_system,
            COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') AS permissions
          FROM roles r
          LEFT JOIN role_permissions rp ON rp.role_id = r.id
          WHERE r.tenant_id = $1
          GROUP BY r.id
          ORDER BY r.name
        `,
        [tenantId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        description: row.description,
        isSystem: row.is_system,
        permissions: row.permissions ?? []
      }));
    }

    return [...(this.rolesByTenant.get(tenantId) ?? [])];
  }

  async createRole(
    tenantId: string,
    input: {
      name: string;
      description: string;
      permissions: string[];
    }
  ): Promise<TenantRoleRecord> {
    const roleId = `role_${randomUUID()}`;

    if (this.db) {
      await this.db.query(
        `
          INSERT INTO roles (id, tenant_id, name, description, is_system, created_at, updated_at)
          VALUES ($1, $2, $3, $4, false, $5, $5)
        `,
        [roleId, tenantId, input.name, input.description, nowIso()]
      );

      for (const permission of input.permissions) {
        await this.db.query(
          `
            INSERT INTO role_permissions (tenant_id, role_id, permission_id, created_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `,
          [tenantId, roleId, permission, nowIso()]
        );
      }

      return {
        id: roleId,
        tenantId,
        name: input.name,
        description: input.description,
        isSystem: false,
        permissions: [...input.permissions]
      };
    }

    const created: TenantRoleRecord = {
      id: roleId,
      tenantId,
      name: input.name,
      description: input.description,
      isSystem: false,
      permissions: [...input.permissions]
    };
    const existing = this.rolesByTenant.get(tenantId) ?? [];
    existing.push(created);
    this.rolesByTenant.set(tenantId, existing);
    return created;
  }

  async validateOAuthClientCredentials(
    clientId: string,
    clientSecret: string
  ): Promise<OAuthClientValidationResult | null> {
    const secretHash = hashSecret(clientSecret);
    if (this.db) {
      const result = await this.db.query<{
        tenant_id: string;
        client_id: string;
      }>(
        `
          SELECT oc.tenant_id, oc.client_id
          FROM oauth_clients oc
          JOIN oauth_client_credentials occ ON occ.oauth_client_id = oc.id
          WHERE oc.client_id = $1
            AND oc.status = 'active'
            AND occ.secret_hash = $2
            AND occ.revoked_at IS NULL
            AND (occ.expires_at IS NULL OR occ.expires_at > current_timestamp)
          ORDER BY occ.created_at DESC
          LIMIT 1
        `,
        [clientId, secretHash]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      return {
        tenantId: row.tenant_id,
        clientId: row.client_id,
        scopes: ["scim.write"],
        roles: ["scim.provisioner"]
      };
    }

    const memoryClient = this.scimClientsByClientId.get(clientId);
    if (!memoryClient || memoryClient.secretHash !== secretHash) {
      return null;
    }

    return {
      tenantId: memoryClient.tenantId,
      clientId: memoryClient.clientId,
      scopes: memoryClient.scopes,
      roles: memoryClient.roles
    };
  }

  async upsertScimUser(tenantId: string, user: ScimUser) {
    if (this.db) {
      const existing = await this.db.query<{ principal_id: string }>(
        `
          SELECT principal_id
          FROM identities
          WHERE tenant_id = $1
            AND provider = 'scim-user'
            AND subject = $2
          LIMIT 1
        `,
        [tenantId, user.externalId]
      );

      const principalId = existing.rows[0]?.principal_id ?? `principal_${randomUUID()}`;
      if (existing.rows.length === 0) {
        await this.db.query(
          `
            INSERT INTO principals (id, tenant_id, principal_type, display_name, status, created_at, updated_at)
            VALUES ($1, $2, 'user', $3, $4, $5, $5)
          `,
          [
            principalId,
            tenantId,
            user.displayName ?? user.userName,
            user.active ? "active" : "disabled",
            nowIso()
          ]
        );
        await this.db.query(
          `
            INSERT INTO identities (id, tenant_id, principal_id, provider, subject, claims, created_at, updated_at)
            VALUES ($1, $2, $3, 'scim-user', $4, $5::jsonb, $6, $6)
          `,
          [
            `identity_${randomUUID()}`,
            tenantId,
            principalId,
            user.externalId,
            JSON.stringify(user),
            nowIso()
          ]
        );
      } else {
        await this.db.query(
          `
            UPDATE principals
            SET display_name = $3,
                status = $4,
                updated_at = $5
            WHERE id = $1
              AND tenant_id = $2
          `,
          [
            principalId,
            tenantId,
            user.displayName ?? user.userName,
            user.active ? "active" : "disabled",
            nowIso()
          ]
        );
      }

      const userId = `user_${principalId}`;
      await this.db.query(
        `
          INSERT INTO users (
            id,
            tenant_id,
            principal_id,
            email,
            given_name,
            family_name,
            display_name,
            active,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            given_name = EXCLUDED.given_name,
            family_name = EXCLUDED.family_name,
            display_name = EXCLUDED.display_name,
            active = EXCLUDED.active,
            updated_at = EXCLUDED.updated_at
        `,
        [
          userId,
          tenantId,
          principalId,
          user.emails?.find((entry: { value: string; primary?: boolean }) => entry.primary)
            ?.value ??
            user.emails?.at(0)?.value ??
            null,
          user.name?.givenName ?? null,
          user.name?.familyName ?? null,
          user.displayName ?? user.userName,
          user.active,
          nowIso()
        ]
      );

      return {
        id: principalId,
        externalId: user.externalId,
        active: user.active
      };
    }

    const key = `${tenantId}:${user.externalId}`;
    const existing = this.scimUsers.get(key);
    const id = existing?.id ?? `principal_${randomUUID()}`;
    const saved = {
      id,
      externalId: user.externalId,
      active: user.active
    };
    this.scimUsers.set(key, saved);
    this.identityToPrincipal.set(memoryIdentityKey(tenantId, "user", user.externalId), {
      principalId: id,
      displayName: user.displayName ?? user.userName
    });
    return saved;
  }

  async upsertScimGroup(tenantId: string, group: ScimGroup) {
    if (this.db) {
      const existing = await this.db.query<{ id: string }>(
        `
          SELECT id
          FROM groups
          WHERE tenant_id = $1
            AND external_id = $2
          LIMIT 1
        `,
        [tenantId, group.externalId]
      );

      const groupId = existing.rows[0]?.id ?? `group_${randomUUID()}`;
      await this.db.query(
        `
          INSERT INTO groups (id, tenant_id, external_id, display_name, active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, true, $5, $5)
          ON CONFLICT (id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            updated_at = EXCLUDED.updated_at
        `,
        [groupId, tenantId, group.externalId, group.displayName, nowIso()]
      );

      await this.db.query("DELETE FROM group_memberships WHERE tenant_id = $1 AND group_id = $2", [
        tenantId,
        groupId
      ]);

      for (const member of group.members) {
        const memberPrincipal = await this.db.query<{ principal_id: string }>(
          `
            SELECT principal_id
            FROM identities
            WHERE tenant_id = $1
              AND provider = 'scim-user'
              AND subject = $2
            LIMIT 1
          `,
          [tenantId, member.value]
        );

        const principalId = memberPrincipal.rows[0]?.principal_id;
        if (!principalId) {
          continue;
        }

        await this.db.query(
          `
            INSERT INTO group_memberships (tenant_id, group_id, principal_id, created_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `,
          [tenantId, groupId, principalId, nowIso()]
        );
      }

      return {
        id: groupId,
        externalId: group.externalId,
        active: true
      };
    }

    const key = `${tenantId}:${group.externalId}`;
    const existing = this.scimGroups.get(key);
    const id = existing?.id ?? `group_${randomUUID()}`;
    const saved = {
      id,
      externalId: group.externalId,
      active: true
    };
    this.scimGroups.set(key, saved);
    return saved;
  }
}
