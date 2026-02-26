import { describe, expect, it } from "vitest";
import { up } from "../migrations/1772075558000_reconcile_auth_foundation_schema.mjs";

describe("reconcile auth foundation schema migration", () => {
  it("creates auth_oidc_requests and required constraints/indexes", async () => {
    const statements = [];
    const pgm = {
      sql(statement) {
        statements.push(String(statement));
      }
    };

    await up(pgm);

    const sql = statements.join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS auth_oidc_requests");
    expect(sql).toContain("auth_oidc_requests_unique_state_hash");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS auth_oidc_requests_expires_at_idx");
  });
});
