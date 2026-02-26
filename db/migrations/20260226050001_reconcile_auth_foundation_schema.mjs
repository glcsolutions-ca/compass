export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS auth_oidc_requests (
      id text PRIMARY KEY,
      state_hash text NOT NULL,
      nonce_hash text NOT NULL,
      pkce_verifier_encrypted_or_hashed text NOT NULL,
      return_to text,
      expires_at timestamp with time zone NOT NULL,
      consumed_at timestamp with time zone,
      created_at timestamp with time zone NOT NULL DEFAULT current_timestamp
    );
  `);

  pgm.sql(`
    ALTER TABLE auth_oidc_requests
      ADD COLUMN IF NOT EXISTS id text,
      ADD COLUMN IF NOT EXISTS state_hash text,
      ADD COLUMN IF NOT EXISTS nonce_hash text,
      ADD COLUMN IF NOT EXISTS pkce_verifier_encrypted_or_hashed text,
      ADD COLUMN IF NOT EXISTS return_to text,
      ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
      ADD COLUMN IF NOT EXISTS consumed_at timestamp with time zone,
      ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT current_timestamp;
  `);

  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'auth_oidc_requests_unique_state_hash'
      ) THEN
        ALTER TABLE auth_oidc_requests
        ADD CONSTRAINT auth_oidc_requests_unique_state_hash UNIQUE (state_hash);
      END IF;
    END
    $$;
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS auth_oidc_requests_expires_at_idx
      ON auth_oidc_requests (expires_at);
  `);
}

export async function down(_pgm) {
  // Down migrations are local-only and should not be used for production rollback.
}
