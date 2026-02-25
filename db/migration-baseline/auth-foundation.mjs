/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable("tenants", {
    id: { type: "text", primaryKey: true },
    name: { type: "text", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status IN ('active', 'inactive')"
    },
    safelist_status: {
      type: "text",
      notNull: true,
      default: "pending",
      check: "safelist_status IN ('approved', 'pending', 'blocked')"
    },
    onboarding_mode: {
      type: "text",
      notNull: true,
      default: "hybrid",
      check: "onboarding_mode IN ('self_serve', 'admin_led', 'hybrid')"
    },
    approved_at: { type: "timestamp with time zone" },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("tenant_domains", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    domain: { type: "text", notNull: true },
    verification_status: {
      type: "text",
      notNull: true,
      default: "pending",
      check: "verification_status IN ('pending', 'verified', 'failed')"
    },
    verified_at: { type: "timestamp with time zone" },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("tenant_domains", "tenant_domains_unique_domain_per_tenant", {
    unique: ["tenant_id", "domain"]
  });
  pgm.createIndex("tenant_domains", ["tenant_id"]);

  pgm.createTable("principals", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    principal_type: {
      type: "text",
      notNull: true,
      check: "principal_type IN ('user', 'app')"
    },
    display_name: { type: "text", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status IN ('active', 'disabled')"
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("principals", ["tenant_id"]);
  pgm.addConstraint("principals", "principals_unique_id_per_tenant", {
    unique: ["tenant_id", "id"]
  });

  pgm.createTable("identities", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    principal_id: {
      type: "text",
      notNull: true,
      references: "principals(id)",
      onDelete: "CASCADE"
    },
    provider: { type: "text", notNull: true },
    subject: { type: "text", notNull: true },
    object_id: { type: "text" },
    app_id: { type: "text" },
    claims: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("identities", "identities_unique_provider_subject_per_tenant", {
    unique: ["tenant_id", "provider", "subject"]
  });
  pgm.createIndex("identities", ["tenant_id"]);
  pgm.createIndex("identities", ["principal_id"]);

  pgm.createTable("users", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    principal_id: {
      type: "text",
      notNull: true,
      references: "principals(id)",
      onDelete: "CASCADE"
    },
    email: { type: "text" },
    given_name: { type: "text" },
    family_name: { type: "text" },
    display_name: { type: "text" },
    active: { type: "boolean", notNull: true, default: true },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("users", "users_unique_principal_per_tenant", {
    unique: ["tenant_id", "principal_id"]
  });
  pgm.createIndex("users", ["tenant_id"]);
  pgm.createIndex("users", ["email"]);

  pgm.createTable("groups", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    external_id: { type: "text" },
    display_name: { type: "text", notNull: true },
    active: { type: "boolean", notNull: true, default: true },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("groups", "groups_unique_external_id_per_tenant", {
    unique: ["tenant_id", "external_id"]
  });
  pgm.createIndex("groups", ["tenant_id"]);

  pgm.createTable("group_memberships", {
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    group_id: {
      type: "text",
      notNull: true,
      references: "groups(id)",
      onDelete: "CASCADE"
    },
    principal_id: {
      type: "text",
      notNull: true,
      references: "principals(id)",
      onDelete: "CASCADE"
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("group_memberships", "group_memberships_pk", {
    primaryKey: ["group_id", "principal_id"]
  });
  pgm.createIndex("group_memberships", ["tenant_id"]);

  pgm.createTable("permissions", {
    id: { type: "text", primaryKey: true },
    description: { type: "text", notNull: true },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.createTable("roles", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    name: { type: "text", notNull: true },
    description: { type: "text", notNull: true, default: "" },
    is_system: { type: "boolean", notNull: true, default: false },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("roles", "roles_unique_name_per_tenant", {
    unique: ["tenant_id", "name"]
  });
  pgm.createIndex("roles", ["tenant_id"]);

  pgm.createTable("role_permissions", {
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    role_id: {
      type: "text",
      notNull: true,
      references: "roles(id)",
      onDelete: "CASCADE"
    },
    permission_id: {
      type: "text",
      notNull: true,
      references: "permissions(id)",
      onDelete: "CASCADE"
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("role_permissions", "role_permissions_pk", {
    primaryKey: ["role_id", "permission_id"]
  });
  pgm.createIndex("role_permissions", ["tenant_id"]);

  pgm.createTable("principal_role_bindings", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    principal_id: {
      type: "text",
      notNull: true,
      references: "principals(id)",
      onDelete: "CASCADE"
    },
    role_id: {
      type: "text",
      notNull: true,
      references: "roles(id)",
      onDelete: "CASCADE"
    },
    source: {
      type: "text",
      notNull: true,
      default: "direct",
      check: "source IN ('direct', 'group', 'scim')"
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("principal_role_bindings", "principal_role_bindings_unique_assignment", {
    unique: ["tenant_id", "principal_id", "role_id", "source"]
  });
  pgm.createIndex("principal_role_bindings", ["tenant_id"]);
  pgm.createIndex("principal_role_bindings", ["principal_id"]);

  pgm.createTable("oauth_clients", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    client_id: { type: "text", notNull: true },
    client_name: { type: "text", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status IN ('active', 'disabled')"
    },
    auth_mode: {
      type: "text",
      notNull: true,
      default: "client_credentials",
      check: "auth_mode IN ('client_credentials', 'authorization_code', 'device_code')"
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("oauth_clients", "oauth_clients_unique_client_per_tenant", {
    unique: ["tenant_id", "client_id"]
  });
  pgm.createIndex("oauth_clients", ["tenant_id"]);

  pgm.createTable("oauth_client_credentials", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    oauth_client_id: {
      type: "text",
      notNull: true,
      references: "oauth_clients(id)",
      onDelete: "CASCADE"
    },
    credential_name: { type: "text", notNull: true },
    secret_hash: { type: "text", notNull: true },
    secret_hint: { type: "text" },
    expires_at: { type: "timestamp with time zone" },
    rotated_at: { type: "timestamp with time zone" },
    revoked_at: { type: "timestamp with time zone" },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("oauth_client_credentials", "oauth_client_credentials_unique_name", {
    unique: ["oauth_client_id", "credential_name"]
  });
  pgm.createIndex("oauth_client_credentials", ["tenant_id"]);
  pgm.createIndex("oauth_client_credentials", ["oauth_client_id"]);

  pgm.createTable("oauth_consents", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    oauth_client_id: {
      type: "text",
      notNull: true,
      references: "oauth_clients(id)",
      onDelete: "CASCADE"
    },
    principal_id: {
      type: "text",
      references: "principals(id)",
      onDelete: "SET NULL"
    },
    granted_scopes: { type: "text[]", notNull: true, default: "{}" },
    granted_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    revoked_at: { type: "timestamp with time zone" }
  });
  pgm.createIndex("oauth_consents", ["tenant_id"]);
  pgm.createIndex("oauth_consents", ["oauth_client_id"]);

  pgm.createTable("scim_connections", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    oauth_client_id: {
      type: "text",
      notNull: true,
      references: "oauth_clients(id)",
      onDelete: "CASCADE"
    },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status IN ('active', 'disabled')"
    },
    last_synced_at: { type: "timestamp with time zone" },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    updated_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("scim_connections", "scim_connections_unique_tenant", {
    unique: ["tenant_id"]
  });
  pgm.createIndex("scim_connections", ["oauth_client_id"]);

  pgm.createTable("auth_audit_events", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      references: "tenants(id)",
      onDelete: "SET NULL"
    },
    event_type: { type: "text", notNull: true },
    actor_principal_id: { type: "text" },
    target_principal_id: { type: "text" },
    metadata: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    occurred_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("auth_audit_events", ["tenant_id"]);
  pgm.createIndex("auth_audit_events", ["occurred_at"]);

  pgm.createTable("session_events", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      references: "tenants(id)",
      onDelete: "SET NULL"
    },
    principal_id: { type: "text" },
    session_id: { type: "text", notNull: true },
    event_type: {
      type: "text",
      notNull: true,
      check: "event_type IN ('created', 'rotated', 'revoked', 'expired')"
    },
    metadata: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    occurred_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("session_events", ["tenant_id"]);
  pgm.createIndex("session_events", ["session_id"]);
  pgm.createIndex("session_events", ["occurred_at"]);

  pgm.sql(`
    INSERT INTO permissions (id, description)
    VALUES
      ('profile.read', 'Read authenticated profile context'),
      ('roles.read', 'List tenant role definitions'),
      ('roles.write', 'Create and edit tenant role definitions'),
      ('scim.write', 'Write SCIM users and groups')
    ON CONFLICT (id) DO NOTHING
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable("session_events", { ifExists: true, cascade: true });
  pgm.dropTable("auth_audit_events", { ifExists: true, cascade: true });
  pgm.dropTable("scim_connections", { ifExists: true, cascade: true });
  pgm.dropTable("oauth_consents", { ifExists: true, cascade: true });
  pgm.dropTable("oauth_client_credentials", { ifExists: true, cascade: true });
  pgm.dropTable("oauth_clients", { ifExists: true, cascade: true });
  pgm.dropTable("principal_role_bindings", { ifExists: true, cascade: true });
  pgm.dropTable("role_permissions", { ifExists: true, cascade: true });
  pgm.dropTable("roles", { ifExists: true, cascade: true });
  pgm.dropTable("permissions", { ifExists: true, cascade: true });
  pgm.dropTable("group_memberships", { ifExists: true, cascade: true });
  pgm.dropTable("groups", { ifExists: true, cascade: true });
  pgm.dropTable("users", { ifExists: true, cascade: true });
  pgm.dropTable("identities", { ifExists: true, cascade: true });
  pgm.dropTable("principals", { ifExists: true, cascade: true });
  pgm.dropTable("tenant_domains", { ifExists: true, cascade: true });
  pgm.dropTable("tenants", { ifExists: true, cascade: true });
};
