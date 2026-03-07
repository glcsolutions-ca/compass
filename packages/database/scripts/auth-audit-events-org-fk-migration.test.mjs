import { describe, expect, it } from "vitest";
import { up } from "../migrations/1772164000000_auth_audit_events_org_fk.mjs";

describe("auth audit events organization fk migration", () => {
  it("moves auth_audit_events tenant_id fk from tenants to organizations", async () => {
    const dropped = [];
    const added = [];

    const pgm = {
      dropConstraint(table, name) {
        dropped.push([String(table), String(name)]);
      },
      addConstraint(table, name, options) {
        added.push({
          table: String(table),
          name: String(name),
          references: String(options?.foreignKeys?.references || "")
        });
      }
    };

    await up(pgm);

    expect(dropped).toContainEqual(["auth_audit_events", "auth_audit_events_tenant_id_fkey"]);
    expect(added).toContainEqual({
      table: "auth_audit_events",
      name: "auth_audit_events_tenant_id_fkey",
      references: "organizations(id)"
    });
  });
});
