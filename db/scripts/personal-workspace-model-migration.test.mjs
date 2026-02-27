import { describe, expect, it } from "vitest";
import { up } from "../migrations/1772162000000_personal_workspace_model.mjs";

describe("personal workspace model migration", () => {
  it("adds tenant kind and owner constraints", async () => {
    const addedColumns = [];
    const constraints = [];
    const indexes = [];

    const pgm = {
      addColumns(table, columns) {
        addedColumns.push([String(table), Object.keys(columns)]);
      },
      addConstraint(table, name) {
        constraints.push([String(table), String(name)]);
      },
      createIndex(table, columns, options) {
        indexes.push({
          table: String(table),
          columns: columns.map((column) => String(column)),
          name: String(options?.name || "")
        });
      }
    };

    await up(pgm);

    expect(addedColumns).toContainEqual(["tenants", ["kind", "owner_user_id"]]);
    expect(constraints).toEqual(
      expect.arrayContaining([
        ["tenants", "tenants_kind_check"],
        ["tenants", "tenants_owner_user_kind_check"]
      ])
    );
    expect(indexes).toContainEqual({
      table: "tenants",
      columns: ["owner_user_id"],
      name: "tenants_owner_user_personal_uidx"
    });
  });
});
