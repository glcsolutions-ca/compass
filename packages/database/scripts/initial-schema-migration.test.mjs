import { describe, expect, it } from "vitest";
import { up } from "../migrations/1772083000000_initial_schema.mjs";

describe("initial schema migration", () => {
  it("creates required v1 baseline tables", async () => {
    const createdTables = [];
    const pgm = {
      createTable(name) {
        createdTables.push(String(name));
      },
      addConstraint() {},
      createIndex() {},
      dropTable() {},
      sql() {},
      func(value) {
        return value;
      }
    };

    await up(pgm);

    expect(createdTables).toEqual(
      expect.arrayContaining([
        "tenants",
        "users",
        "identities",
        "memberships",
        "invites",
        "auth_oidc_requests",
        "auth_sessions",
        "auth_audit_events",
        "codex_threads",
        "codex_turns",
        "codex_items",
        "codex_events",
        "codex_approvals",
        "codex_auth_state",
        "runtime_events"
      ])
    );
  });
});
