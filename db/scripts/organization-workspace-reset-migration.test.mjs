import { describe, expect, it } from "vitest";
import { up } from "../migrations/1772163000000_organization_workspace_reset.mjs";

describe("organization workspace reset migration", () => {
  it("creates organization/workspace tables and workspace_id on agent threads", async () => {
    const createdTables = [];
    const addedColumns = [];
    const addedConstraints = [];
    const sqlStatements = [];

    const pgm = {
      createTable(name) {
        createdTables.push(String(name));
      },
      addColumns(table, columns) {
        addedColumns.push([String(table), Object.keys(columns)]);
      },
      addConstraint(table, name) {
        addedConstraints.push([String(table), String(name)]);
      },
      createIndex() {},
      alterColumn() {},
      dropIndex() {},
      dropColumn() {},
      dropTable() {},
      func(value) {
        return value;
      },
      sql(statement) {
        sqlStatements.push(String(statement));
      }
    };

    await up(pgm);

    expect(createdTables).toEqual(
      expect.arrayContaining([
        "organizations",
        "organization_memberships",
        "workspaces",
        "workspace_memberships",
        "workspace_invites"
      ])
    );
    expect(addedConstraints).toEqual(
      expect.arrayContaining([
        ["organizations", "organizations_unique_slug"],
        ["organization_memberships", "organization_memberships_pk"],
        ["workspaces", "workspaces_unique_slug"],
        ["workspace_memberships", "workspace_memberships_pk"],
        ["workspace_invites", "workspace_invites_unique_token_hash"],
        ["workspace_invites", "workspace_invites_acceptance_consistency_check"]
      ])
    );
    expect(addedColumns).toContainEqual(["agent_threads", ["workspace_id"]]);
    expect(sqlStatements.some((statement) => statement.includes("insert into organizations"))).toBe(
      true
    );
    expect(sqlStatements.some((statement) => statement.includes("update agent_threads at"))).toBe(
      true
    );
  });
});
