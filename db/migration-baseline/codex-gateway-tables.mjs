export const shorthands = undefined;

export async function up(pgm) {
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

export async function down(pgm) {
  pgm.dropTable("codex_auth_state");
  pgm.dropTable("codex_approvals");
  pgm.dropTable("codex_events");
  pgm.dropTable("codex_items");
  pgm.dropTable("codex_turns");
  pgm.dropTable("codex_threads");
}
