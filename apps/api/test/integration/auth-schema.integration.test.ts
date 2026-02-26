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

describe("auth schema constraints", () => {
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
        auth_oidc_requests,
        invites,
        memberships,
        identities,
        users,
        tenants
      restart identity cascade
    `);
  });

  it("enforces unique tenant slug", async () => {
    await client.query(
      `insert into tenants (id, slug, name, status, created_at, updated_at)
       values ('t_1', 'acme', 'Acme', 'active', now(), now())`
    );

    await expect(
      client.query(
        `insert into tenants (id, slug, name, status, created_at, updated_at)
         values ('t_2', 'acme', 'Acme Duplicate', 'active', now(), now())`
      )
    ).rejects.toThrow(/tenants_unique_slug/iu);
  });

  it("enforces unique Entra identity subject", async () => {
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_2', 'owner2@acme.test', 'Owner 2', now(), now())`
    );

    await client.query(
      `insert into identities (
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
        ) values (
          'i_1',
          'u_1',
          'entra',
          '11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0',
          'owner@acme.test',
          'owner@acme.test',
          now(),
          now()
        )`
    );

    await expect(
      client.query(
        `insert into identities (
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
          ) values (
            'i_2',
            'u_2',
            'entra',
            '11111111-1111-1111-1111-111111111111',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/v2.0',
            'owner2@acme.test',
            'owner2@acme.test',
            now(),
            now()
          )`
      )
    ).rejects.toThrow(/identities_unique_entra_subject/iu);
  });

  it("enforces unique user membership per tenant", async () => {
    await client.query(
      `insert into tenants (id, slug, name, status, created_at, updated_at)
       values ('t_1', 'acme', 'Acme', 'active', now(), now())`
    );
    await client.query(
      `insert into users (id, primary_email, display_name, created_at, updated_at)
       values ('u_1', 'owner@acme.test', 'Owner', now(), now())`
    );

    await client.query(
      `insert into memberships (
         tenant_id,
         user_id,
         role,
         status,
         created_at,
         updated_at
       ) values ('t_1', 'u_1', 'owner', 'active', now(), now())`
    );

    await expect(
      client.query(
        `insert into memberships (
           tenant_id,
           user_id,
           role,
           status,
           created_at,
           updated_at
         ) values ('t_1', 'u_1', 'admin', 'active', now(), now())`
      )
    ).rejects.toThrow(/memberships_pk/iu);
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
});
