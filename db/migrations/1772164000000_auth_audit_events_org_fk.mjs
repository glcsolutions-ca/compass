export const shorthands = undefined;

export async function up(pgm) {
  pgm.dropConstraint("auth_audit_events", "auth_audit_events_tenant_id_fkey", {
    ifExists: true
  });

  pgm.addConstraint("auth_audit_events", "auth_audit_events_tenant_id_fkey", {
    foreignKeys: {
      columns: "tenant_id",
      references: "organizations(id)",
      onDelete: "SET NULL"
    }
  });
}

export async function down(pgm) {
  pgm.dropConstraint("auth_audit_events", "auth_audit_events_tenant_id_fkey", {
    ifExists: true
  });

  pgm.addConstraint("auth_audit_events", "auth_audit_events_tenant_id_fkey", {
    foreignKeys: {
      columns: "tenant_id",
      references: "tenants(id)",
      onDelete: "SET NULL"
    }
  });
}
