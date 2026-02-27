import path from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const repoRoot = path.resolve(import.meta.dirname, "../../../../");
function resolveIntegrationDatabaseUrl(repoRootPath: string): string {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const envPath = path.join(repoRootPath, "db/postgres/.env");
  const content = readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/u);
  const values = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
    if (!match) {
      continue;
    }

    values.set(match[1], match[2].trim());
  }

  const fromFile = values.get("DATABASE_URL")?.trim();
  if (fromFile) {
    return fromFile;
  }

  const port = values.get("POSTGRES_PORT")?.trim() || "5432";
  return `postgres://compass:compass@localhost:${port}/compass`;
}

const databaseUrl = resolveIntegrationDatabaseUrl(repoRoot);

describe("organization/workspace auth schema constraints", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query(`
      truncate table
        auth_audit_events,
        auth_sessions,
        auth_desktop_handoffs,
        auth_oidc_requests,
        workspace_invites,
        workspace_memberships,
        workspaces,
        organization_memberships,
        identities,
        users,
        organizations
      restart identity cascade
    `);
  });

  it("enforces unique organization slug", async () => {
    await client.query(
      `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
       values ('org_1', 'acme', 'Acme', 'active', 'shared', null, now(), now())`
    );

    await expect(
      client.query(
        `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
         values ('org_2', 'acme', 'Acme Duplicate', 'active', 'shared', null, now(), now())`
      )
    ).rejects.toThrow(/organizations_unique_slug/iu);
  });

  it("enforces one personal organization per owner user", async () => {
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );

    await client.query(
      `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
       values ('org_personal_1', 'personal-owner', 'Owner Personal', 'active', 'personal', 'u_1', now(), now())`
    );

    await expect(
      client.query(
        `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
         values ('org_personal_2', 'personal-owner-2', 'Owner Personal 2', 'active', 'personal', 'u_1', now(), now())`
      )
    ).rejects.toThrow(/organizations_owner_user_personal_uidx/iu);
  });

  it("enforces unique workspace slug", async () => {
    await client.query(
      `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
       values ('org_1', 'acme', 'Acme', 'active', 'shared', null, now(), now())`
    );
    await client.query(
      `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
       values ('org_2', 'globex', 'Globex', 'active', 'shared', null, now(), now())`
    );

    await client.query(
      `insert into workspaces (id, organization_id, slug, name, status, is_personal, created_at, updated_at)
       values ('ws_1', 'org_1', 'engineering', 'Engineering', 'active', false, now(), now())`
    );

    await expect(
      client.query(
        `insert into workspaces (id, organization_id, slug, name, status, is_personal, created_at, updated_at)
         values ('ws_2', 'org_2', 'engineering', 'Engineering Duplicate', 'active', false, now(), now())`
      )
    ).rejects.toThrow(/workspaces_unique_slug/iu);
  });

  it("enforces one personal workspace per organization", async () => {
    await client.query(
      `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
       values ('org_1', 'acme', 'Acme', 'active', 'shared', null, now(), now())`
    );

    await client.query(
      `insert into workspaces (id, organization_id, slug, name, status, is_personal, created_at, updated_at)
       values ('ws_personal_1', 'org_1', 'acme-personal', 'Personal', 'active', true, now(), now())`
    );

    await expect(
      client.query(
        `insert into workspaces (id, organization_id, slug, name, status, is_personal, created_at, updated_at)
         values ('ws_personal_2', 'org_1', 'acme-personal-2', 'Personal 2', 'active', true, now(), now())`
      )
    ).rejects.toThrow(/workspaces_organization_personal_uidx/iu);
  });

  it("enforces unique organization membership for user+organization", async () => {
    await client.query(
      `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
       values ('org_1', 'acme', 'Acme', 'active', 'shared', null, now(), now())`
    );
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );

    await client.query(
      `insert into organization_memberships (organization_id, user_id, role, status, created_at, updated_at)
       values ('org_1', 'u_1', 'owner', 'active', now(), now())`
    );

    await expect(
      client.query(
        `insert into organization_memberships (organization_id, user_id, role, status, created_at, updated_at)
         values ('org_1', 'u_1', 'admin', 'active', now(), now())`
      )
    ).rejects.toThrow(/organization_memberships_pk/iu);
  });

  it("enforces unique workspace membership for user+workspace", async () => {
    await client.query(
      `insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
       values ('org_1', 'acme', 'Acme', 'active', 'shared', null, now(), now())`
    );
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );
    await client.query(
      `insert into workspaces (id, organization_id, slug, name, status, is_personal, created_at, updated_at)
       values ('ws_1', 'org_1', 'acme-main', 'Main', 'active', false, now(), now())`
    );

    await client.query(
      `insert into workspace_memberships (workspace_id, user_id, role, status, created_at, updated_at)
       values ('ws_1', 'u_1', 'admin', 'active', now(), now())`
    );

    await expect(
      client.query(
        `insert into workspace_memberships (workspace_id, user_id, role, status, created_at, updated_at)
         values ('ws_1', 'u_1', 'member', 'active', now(), now())`
      )
    ).rejects.toThrow(/workspace_memberships_pk/iu);
  });

  it("stores and enforces unique session token hash", async () => {
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );

    await client.query(
      `insert into auth_sessions (
         id,
         user_id,
         token_hash,
         user_agent_hash,
         ip_hash,
         created_at,
         expires_at,
         last_seen_at
       ) values (
         's_1',
         'u_1',
         'token-hash-1',
         null,
         null,
         now(),
         now() + interval '8 hour',
         now()
       )`
    );

    await expect(
      client.query(
        `insert into auth_sessions (
           id,
           user_id,
           token_hash,
           user_agent_hash,
           ip_hash,
           created_at,
           expires_at,
           last_seen_at
         ) values (
           's_2',
           'u_1',
           'token-hash-1',
           null,
           null,
           now(),
           now() + interval '8 hour',
           now()
         )`
      )
    ).rejects.toThrow(/auth_sessions_unique_token_hash/iu);
  });

  it("enforces unique OIDC request state hash", async () => {
    await client.query(
      `insert into auth_oidc_requests (
         id,
         state_hash,
         nonce_hash,
         pkce_verifier_encrypted_or_hashed,
         return_to,
         expires_at,
         created_at
       ) values (
         'req_1',
         'state-hash-1',
         'nonce-1',
         'pkce-1',
         '/',
         now() + interval '10 minute',
         now()
       )`
    );

    await expect(
      client.query(
        `insert into auth_oidc_requests (
           id,
           state_hash,
           nonce_hash,
           pkce_verifier_encrypted_or_hashed,
           return_to,
           expires_at,
           created_at
         ) values (
           'req_2',
           'state-hash-1',
           'nonce-2',
           'pkce-2',
           '/',
           now() + interval '10 minute',
           now()
         )`
      )
    ).rejects.toThrow(/auth_oidc_requests_unique_state_hash/iu);
  });
  it("enforces unique desktop auth handoff token hash", async () => {
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );

    await client.query(
      `insert into auth_desktop_handoffs (
         id,
         handoff_token_hash,
         user_id,
         redirect_to,
         expires_at,
         created_at
       ) values (
         'handoff_1',
         'handoff-hash-1',
         'u_1',
         '/chat',
         now() + interval '2 minute',
         now()
       )`
    );

    await expect(
      client.query(
        `insert into auth_desktop_handoffs (
           id,
           handoff_token_hash,
           user_id,
           redirect_to,
           expires_at,
           created_at
         ) values (
           'handoff_2',
           'handoff-hash-1',
           'u_1',
           '/chat',
           now() + interval '2 minute',
           now()
         )`
      )
    ).rejects.toThrow(/auth_desktop_handoffs_unique_token_hash/iu);
  });

  it("enforces invite accepted_by_user_id foreign key", async () => {
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );
    await client.query(
      `insert into tenants (id, slug, name, status, created_at, updated_at)
       values ('t_1', 'acme', 'Acme', 'active', now(), now())`
    );

    await expect(
      client.query(
        `insert into invites (
           id,
           tenant_id,
           email_normalized,
           role,
           token_hash,
           invited_by_user_id,
           expires_at,
           accepted_at,
           accepted_by_user_id,
           created_at
         ) values (
           'inv_1',
           't_1',
           'member@acme.test',
           'member',
           'token-hash-1',
           'u_1',
           now() + interval '7 day',
           now(),
           'u_missing',
           now()
         )`
      )
    ).rejects.toThrow(/invites_accepted_by_user_id_fkey/iu);
  });

  it("enforces invite acceptance consistency when accepted_at is set", async () => {
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );
    await client.query(
      `insert into tenants (id, slug, name, status, created_at, updated_at)
       values ('t_1', 'acme', 'Acme', 'active', now(), now())`
    );

    await expect(
      client.query(
        `insert into invites (
           id,
           tenant_id,
           email_normalized,
           role,
           token_hash,
           invited_by_user_id,
           expires_at,
           accepted_at,
           accepted_by_user_id,
           created_at
         ) values (
           'inv_accepted_missing_user',
           't_1',
           'member@acme.test',
           'member',
           'token-hash-accepted-missing-user',
           'u_1',
           now() + interval '7 day',
           now(),
           null,
           now()
         )`
      )
    ).rejects.toThrow(/invites_acceptance_consistency_check/iu);
  });

  it("enforces invite acceptance consistency when accepted_by_user_id is set", async () => {
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_2', 'member@acme.test', 'Member', now(), now())`
    );
    await client.query(
      `insert into tenants (id, slug, name, status, created_at, updated_at)
       values ('t_1', 'acme', 'Acme', 'active', now(), now())`
    );

    await expect(
      client.query(
        `insert into invites (
           id,
           tenant_id,
           email_normalized,
           role,
           token_hash,
           invited_by_user_id,
           expires_at,
           accepted_at,
           accepted_by_user_id,
           created_at
         ) values (
           'inv_user_missing_accepted_at',
           't_1',
           'member@acme.test',
           'member',
           'token-hash-user-missing-accepted-at',
           'u_1',
           now() + interval '7 day',
           null,
           'u_2',
           now()
         )`
      )
    ).rejects.toThrow(/invites_acceptance_consistency_check/iu);
  });
});
