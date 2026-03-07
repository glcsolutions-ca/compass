export const shorthands = undefined;

const TENANT_KIND_CHECK = "kind in ('personal', 'workspace')";
const TENANT_OWNER_KIND_CHECK =
  "((kind = 'personal' and owner_user_id is not null) or (kind = 'workspace' and owner_user_id is null))";

export async function up(pgm) {
  pgm.addColumns("tenants", {
    kind: {
      type: "text",
      notNull: true,
      default: "workspace"
    },
    owner_user_id: {
      type: "text",
      references: "users(id)",
      onDelete: "CASCADE"
    }
  });

  pgm.addConstraint("tenants", "tenants_kind_check", {
    check: TENANT_KIND_CHECK
  });

  pgm.addConstraint("tenants", "tenants_owner_user_kind_check", {
    check: TENANT_OWNER_KIND_CHECK
  });

  pgm.createIndex("tenants", ["owner_user_id"], {
    name: "tenants_owner_user_personal_uidx",
    unique: true,
    where: "kind = 'personal' and owner_user_id is not null"
  });
}

export async function down(pgm) {
  pgm.dropIndex("tenants", ["owner_user_id"], {
    name: "tenants_owner_user_personal_uidx"
  });

  pgm.dropConstraint("tenants", "tenants_owner_user_kind_check");
  pgm.dropConstraint("tenants", "tenants_kind_check");

  pgm.dropColumns("tenants", ["owner_user_id", "kind"]);
}
