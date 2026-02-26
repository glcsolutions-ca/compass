export const shorthands = undefined;

function createAuthTables(pgm) {
  pgm.createTable("tenants", {
    id: { type: "text", primaryKey: true },
    slug: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
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
  pgm.addConstraint("tenants", "tenants_unique_slug", {
    unique: ["slug"]
  });

  pgm.createTable("users", {
    id: { type: "text", primaryKey: true },
    primary_email: { type: "text" },
    display_name: { type: "text" },
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
  pgm.createIndex("users", ["primary_email"]);

  pgm.createTable("identities", {
    id: { type: "text", primaryKey: true },
    user_id: {
      type: "text",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE"
    },
    provider: {
      type: "text",
      notNull: true,
      default: "entra",
      check: "provider = 'entra'"
    },
    entra_tid: { type: "text", notNull: true },
    entra_oid: { type: "text", notNull: true },
    iss: { type: "text", notNull: true },
    email: { type: "text" },
    upn: { type: "text" },
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
  pgm.addConstraint("identities", "identities_unique_entra_subject", {
    unique: ["provider", "entra_tid", "entra_oid"]
  });
  pgm.createIndex("identities", ["user_id"]);

  pgm.createTable("memberships", {
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    user_id: {
      type: "text",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE"
    },
    role: {
      type: "text",
      notNull: true,
      check: "role IN ('owner', 'admin', 'member', 'viewer')"
    },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status IN ('active', 'invited', 'disabled')"
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
  pgm.addConstraint("memberships", "memberships_pk", {
    primaryKey: ["tenant_id", "user_id"]
  });
  pgm.createIndex("memberships", ["user_id"]);

  pgm.createTable("invites", {
    id: { type: "text", primaryKey: true },
    tenant_id: {
      type: "text",
      notNull: true,
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    email_normalized: { type: "text", notNull: true },
    role: {
      type: "text",
      notNull: true,
      check: "role IN ('admin', 'member', 'viewer')"
    },
    token_hash: { type: "text", notNull: true },
    invited_by_user_id: {
      type: "text",
      references: "users(id)",
      onDelete: "SET NULL"
    },
    expires_at: { type: "timestamp with time zone", notNull: true },
    accepted_at: { type: "timestamp with time zone" },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("invites", "invites_unique_token_hash", {
    unique: ["token_hash"]
  });
  pgm.createIndex("invites", ["tenant_id"]);
  pgm.createIndex("invites", ["email_normalized"]);

  pgm.createTable("auth_oidc_requests", {
    id: { type: "text", primaryKey: true },
    state_hash: { type: "text", notNull: true },
    nonce_hash: { type: "text", notNull: true },
    pkce_verifier_encrypted_or_hashed: { type: "text", notNull: true },
    return_to: { type: "text" },
    expires_at: { type: "timestamp with time zone", notNull: true },
    consumed_at: { type: "timestamp with time zone" },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("auth_oidc_requests", "auth_oidc_requests_unique_state_hash", {
    unique: ["state_hash"]
  });
  pgm.createIndex("auth_oidc_requests", ["expires_at"]);

  pgm.createTable("auth_sessions", {
    id: { type: "text", primaryKey: true },
    user_id: {
      type: "text",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE"
    },
    token_hash: { type: "text", notNull: true },
    user_agent_hash: { type: "text" },
    ip_hash: { type: "text" },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    expires_at: { type: "timestamp with time zone", notNull: true },
    last_seen_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    },
    revoked_at: { type: "timestamp with time zone" }
  });
  pgm.addConstraint("auth_sessions", "auth_sessions_unique_token_hash", {
    unique: ["token_hash"]
  });
  pgm.createIndex("auth_sessions", ["user_id"]);
  pgm.createIndex("auth_sessions", ["expires_at"]);

  pgm.createTable("auth_audit_events", {
    id: { type: "text", primaryKey: true },
    event_type: { type: "text", notNull: true },
    actor_user_id: {
      type: "text",
      references: "users(id)",
      onDelete: "SET NULL"
    },
    tenant_id: {
      type: "text",
      references: "tenants(id)",
      onDelete: "SET NULL"
    },
    metadata: { type: "jsonb", notNull: true, default: pgm.func("'{}'::jsonb") },
    occurred_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.createIndex("auth_audit_events", ["event_type", "occurred_at"]);
  pgm.createIndex("auth_audit_events", ["tenant_id"]);
}

function createCodexGatewayTables(pgm) {
  pgm.createTable("codex_threads", {
    thread_id: {
      type: "text",
      primaryKey: true
    },
    title: {
      type: "text"
    },
    status: {
      type: "text",
      notNull: true,
      default: "unknown"
    },
    model: {
      type: "text"
    },
    cwd: {
      type: "text"
    },
    archived: {
      type: "boolean",
      notNull: true,
      default: false
    },
    metadata: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    }
  });

  pgm.createTable("codex_turns", {
    turn_id: {
      type: "text",
      primaryKey: true
    },
    thread_id: {
      type: "text",
      notNull: true,
      references: "codex_threads",
      onDelete: "cascade"
    },
    status: {
      type: "text",
      notNull: true,
      default: "inProgress"
    },
    input: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'[]'::jsonb")
    },
    output: {
      type: "jsonb"
    },
    error: {
      type: "jsonb"
    },
    started_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    },
    completed_at: {
      type: "timestamptz"
    }
  });

  pgm.createTable("codex_items", {
    item_id: {
      type: "text",
      primaryKey: true
    },
    thread_id: {
      type: "text",
      notNull: true,
      references: "codex_threads",
      onDelete: "cascade"
    },
    turn_id: {
      type: "text",
      notNull: true,
      references: "codex_turns",
      onDelete: "cascade"
    },
    item_type: {
      type: "text",
      notNull: true
    },
    status: {
      type: "text",
      notNull: true,
      default: "inProgress"
    },
    payload: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    }
  });

  pgm.createTable("codex_events", {
    id: {
      type: "bigserial",
      primaryKey: true
    },
    thread_id: {
      type: "text"
    },
    turn_id: {
      type: "text"
    },
    method: {
      type: "text",
      notNull: true
    },
    payload: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    }
  });

  pgm.createTable("codex_approvals", {
    request_id: {
      type: "text",
      primaryKey: true
    },
    thread_id: {
      type: "text"
    },
    turn_id: {
      type: "text"
    },
    item_id: {
      type: "text"
    },
    approval_type: {
      type: "text",
      notNull: true
    },
    status: {
      type: "text",
      notNull: true,
      default: "pending"
    },
    decision: {
      type: "text"
    },
    reason: {
      type: "text"
    },
    payload: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    },
    resolved_at: {
      type: "timestamptz"
    }
  });

  pgm.createTable("codex_auth_state", {
    auth_state_id: {
      type: "text",
      primaryKey: true
    },
    auth_mode: {
      type: "text"
    },
    account: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    }
  });

  pgm.createIndex("codex_events", ["thread_id", "created_at"], {
    name: "codex_events_thread_created_idx"
  });

  pgm.createIndex("codex_turns", ["thread_id", "started_at"], {
    name: "codex_turns_thread_started_idx"
  });

  pgm.createIndex("codex_items", ["thread_id", "updated_at"], {
    name: "codex_items_thread_updated_idx"
  });

  pgm.createIndex("codex_approvals", ["thread_id", "created_at"], {
    name: "codex_approvals_thread_created_idx"
  });

  pgm.sql(
    `insert into codex_auth_state (auth_state_id, auth_mode, account, updated_at)
     values ('global', null, '{}'::jsonb, now())
     on conflict (auth_state_id) do nothing`
  );
}

export async function up(pgm) {
  createAuthTables(pgm);
  createCodexGatewayTables(pgm);

  pgm.createTable("runtime_events", {
    id: {
      type: "bigserial",
      primaryKey: true
    },
    event_type: {
      type: "text",
      notNull: true
    },
    payload: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()")
    }
  });

  pgm.createIndex("runtime_events", ["event_type", "created_at"], {
    name: "runtime_events_type_created_idx"
  });
}

export async function down(pgm) {
  pgm.dropTable("runtime_events");

  pgm.dropTable("codex_auth_state");
  pgm.dropTable("codex_approvals");
  pgm.dropTable("codex_events");
  pgm.dropTable("codex_items");
  pgm.dropTable("codex_turns");
  pgm.dropTable("codex_threads");

  pgm.dropTable("auth_audit_events");
  pgm.dropTable("auth_sessions");
  pgm.dropTable("auth_oidc_requests");
  pgm.dropTable("invites");
  pgm.dropTable("memberships");
  pgm.dropTable("identities");
  pgm.dropTable("users");
  pgm.dropTable("tenants");
}
