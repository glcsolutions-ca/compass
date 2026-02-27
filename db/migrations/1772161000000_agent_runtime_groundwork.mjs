export const shorthands = undefined;

const THREAD_MODE_CHECK = "execution_mode in ('cloud', 'local')";
const THREAD_HOST_CHECK = "execution_host in ('dynamic_sessions', 'desktop_local')";

export async function up(pgm) {
  pgm.renameTable("codex_threads", "agent_threads");
  pgm.renameTable("codex_turns", "agent_turns");
  pgm.renameTable("codex_items", "agent_items");
  pgm.renameTable("codex_events", "agent_events");
  pgm.renameTable("codex_approvals", "agent_approvals");
  pgm.renameTable("codex_auth_state", "agent_auth_state");

  pgm.renameIndex(
    "agent_events",
    "codex_events_thread_created_idx",
    "agent_events_thread_created_idx"
  );
  pgm.renameIndex(
    "agent_turns",
    "codex_turns_thread_started_idx",
    "agent_turns_thread_started_idx"
  );
  pgm.renameIndex(
    "agent_items",
    "codex_items_thread_updated_idx",
    "agent_items_thread_updated_idx"
  );
  pgm.renameIndex(
    "agent_approvals",
    "codex_approvals_thread_created_idx",
    "agent_approvals_thread_created_idx"
  );

  pgm.addColumns("agent_threads", {
    tenant_id: {
      type: "text",
      references: "tenants(id)",
      onDelete: "CASCADE"
    },
    execution_mode: {
      type: "text",
      notNull: true,
      default: "cloud"
    },
    execution_host: {
      type: "text",
      notNull: true,
      default: "dynamic_sessions"
    },
    cloud_session_identifier: {
      type: "text"
    },
    mode_switched_at: {
      type: "timestamptz"
    }
  });

  pgm.addConstraint("agent_threads", "agent_threads_execution_mode_check", {
    check: THREAD_MODE_CHECK
  });
  pgm.addConstraint("agent_threads", "agent_threads_execution_host_check", {
    check: THREAD_HOST_CHECK
  });

  pgm.createIndex("agent_threads", ["tenant_id"], {
    name: "agent_threads_tenant_id_idx"
  });
  pgm.createIndex("agent_threads", ["cloud_session_identifier"], {
    name: "agent_threads_cloud_session_identifier_uidx",
    unique: true,
    where: "cloud_session_identifier is not null"
  });

  pgm.addColumns("agent_turns", {
    execution_mode: {
      type: "text",
      notNull: true,
      default: "cloud"
    },
    execution_host: {
      type: "text",
      notNull: true,
      default: "dynamic_sessions"
    },
    runtime_metadata: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb")
    }
  });

  pgm.addConstraint("agent_turns", "agent_turns_execution_mode_check", {
    check: THREAD_MODE_CHECK
  });
  pgm.addConstraint("agent_turns", "agent_turns_execution_host_check", {
    check: THREAD_HOST_CHECK
  });
}

export async function down(pgm) {
  pgm.dropConstraint("agent_turns", "agent_turns_execution_host_check");
  pgm.dropConstraint("agent_turns", "agent_turns_execution_mode_check");
  pgm.dropColumns("agent_turns", ["runtime_metadata", "execution_host", "execution_mode"]);

  pgm.dropIndex("agent_threads", ["cloud_session_identifier"], {
    name: "agent_threads_cloud_session_identifier_uidx"
  });
  pgm.dropIndex("agent_threads", ["tenant_id"], {
    name: "agent_threads_tenant_id_idx"
  });

  pgm.dropConstraint("agent_threads", "agent_threads_execution_host_check");
  pgm.dropConstraint("agent_threads", "agent_threads_execution_mode_check");
  pgm.dropColumns("agent_threads", [
    "mode_switched_at",
    "cloud_session_identifier",
    "execution_host",
    "execution_mode",
    "tenant_id"
  ]);

  pgm.renameIndex(
    "agent_approvals",
    "agent_approvals_thread_created_idx",
    "codex_approvals_thread_created_idx"
  );
  pgm.renameIndex(
    "agent_items",
    "agent_items_thread_updated_idx",
    "codex_items_thread_updated_idx"
  );
  pgm.renameIndex(
    "agent_turns",
    "agent_turns_thread_started_idx",
    "codex_turns_thread_started_idx"
  );
  pgm.renameIndex(
    "agent_events",
    "agent_events_thread_created_idx",
    "codex_events_thread_created_idx"
  );

  pgm.renameTable("agent_auth_state", "codex_auth_state");
  pgm.renameTable("agent_approvals", "codex_approvals");
  pgm.renameTable("agent_events", "codex_events");
  pgm.renameTable("agent_items", "codex_items");
  pgm.renameTable("agent_turns", "codex_turns");
  pgm.renameTable("agent_threads", "codex_threads");
}
