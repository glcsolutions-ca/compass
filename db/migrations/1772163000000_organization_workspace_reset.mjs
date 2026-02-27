export const shorthands = undefined;

const ORGANIZATION_KIND_CHECK = "kind in ('personal', 'shared')";
const ORGANIZATION_OWNER_KIND_CHECK =
  "((kind = 'personal' and owner_user_id is not null) or (kind = 'shared' and owner_user_id is null))";

export async function up(pgm) {
  pgm.createTable("organizations", {
    id: { type: "text", primaryKey: true },
    slug: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status in ('active', 'disabled')"
    },
    kind: {
      type: "text",
      notNull: true,
      default: "shared"
    },
    owner_user_id: {
      type: "text",
      references: "users(id)",
      onDelete: "CASCADE"
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
  pgm.addConstraint("organizations", "organizations_unique_slug", {
    unique: ["slug"]
  });
  pgm.addConstraint("organizations", "organizations_kind_check", {
    check: ORGANIZATION_KIND_CHECK
  });
  pgm.addConstraint("organizations", "organizations_owner_user_kind_check", {
    check: ORGANIZATION_OWNER_KIND_CHECK
  });
  pgm.createIndex("organizations", ["owner_user_id"], {
    name: "organizations_owner_user_personal_uidx",
    unique: true,
    where: "kind = 'personal' and owner_user_id is not null"
  });

  pgm.createTable("organization_memberships", {
    organization_id: {
      type: "text",
      notNull: true,
      references: "organizations(id)",
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
      check: "role in ('owner', 'admin', 'member')"
    },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status in ('active', 'invited', 'disabled')"
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
  pgm.addConstraint("organization_memberships", "organization_memberships_pk", {
    primaryKey: ["organization_id", "user_id"]
  });
  pgm.createIndex("organization_memberships", ["user_id"]);

  pgm.createTable("workspaces", {
    id: { type: "text", primaryKey: true },
    organization_id: {
      type: "text",
      notNull: true,
      references: "organizations(id)",
      onDelete: "CASCADE"
    },
    slug: { type: "text", notNull: true },
    name: { type: "text", notNull: true },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status in ('active', 'disabled')"
    },
    is_personal: {
      type: "boolean",
      notNull: true,
      default: false
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
  pgm.addConstraint("workspaces", "workspaces_unique_slug", {
    unique: ["slug"]
  });
  pgm.createIndex("workspaces", ["organization_id"]);
  pgm.createIndex("workspaces", ["organization_id"], {
    name: "workspaces_organization_personal_uidx",
    unique: true,
    where: "is_personal = true"
  });

  pgm.createTable("workspace_memberships", {
    workspace_id: {
      type: "text",
      notNull: true,
      references: "workspaces(id)",
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
      check: "role in ('admin', 'member')"
    },
    status: {
      type: "text",
      notNull: true,
      default: "active",
      check: "status in ('active', 'invited', 'disabled')"
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
  pgm.addConstraint("workspace_memberships", "workspace_memberships_pk", {
    primaryKey: ["workspace_id", "user_id"]
  });
  pgm.createIndex("workspace_memberships", ["user_id"]);

  pgm.createTable("workspace_invites", {
    id: { type: "text", primaryKey: true },
    workspace_id: {
      type: "text",
      notNull: true,
      references: "workspaces(id)",
      onDelete: "CASCADE"
    },
    email_normalized: { type: "text", notNull: true },
    role: {
      type: "text",
      notNull: true,
      check: "role in ('admin', 'member')"
    },
    token_hash: { type: "text", notNull: true },
    invited_by_user_id: {
      type: "text",
      references: "users(id)",
      onDelete: "SET NULL"
    },
    expires_at: { type: "timestamp with time zone", notNull: true },
    accepted_at: { type: "timestamp with time zone" },
    accepted_by_user_id: {
      type: "text",
      references: "users(id)",
      onDelete: "SET NULL"
    },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });
  pgm.addConstraint("workspace_invites", "workspace_invites_unique_token_hash", {
    unique: ["token_hash"]
  });
  pgm.addConstraint("workspace_invites", "workspace_invites_acceptance_consistency_check", {
    check:
      "((accepted_at is null and accepted_by_user_id is null) or (accepted_at is not null and accepted_by_user_id is not null))"
  });
  pgm.createIndex("workspace_invites", ["workspace_id"]);
  pgm.createIndex("workspace_invites", ["email_normalized"]);

  pgm.sql(`
    insert into organizations (id, slug, name, status, kind, owner_user_id, created_at, updated_at)
    select
      t.id,
      t.slug,
      t.name,
      t.status,
      case when t.kind = 'personal' then 'personal' else 'shared' end as kind,
      t.owner_user_id,
      t.created_at,
      t.updated_at
    from tenants t
    on conflict (id) do nothing;
  `);

  pgm.sql(`
    insert into organization_memberships (
      organization_id,
      user_id,
      role,
      status,
      created_at,
      updated_at
    )
    select
      m.tenant_id as organization_id,
      m.user_id,
      case
        when m.role in ('owner', 'admin', 'member') then m.role
        else 'member'
      end as role,
      m.status,
      m.created_at,
      m.updated_at
    from memberships m
    on conflict (organization_id, user_id) do nothing;
  `);

  pgm.sql(`
    insert into workspaces (id, organization_id, slug, name, status, is_personal, created_at, updated_at)
    select
      o.id,
      o.id as organization_id,
      o.slug,
      o.name,
      o.status,
      (o.kind = 'personal') as is_personal,
      o.created_at,
      o.updated_at
    from organizations o
    on conflict (id) do nothing;
  `);

  pgm.sql(`
    insert into workspace_memberships (
      workspace_id,
      user_id,
      role,
      status,
      created_at,
      updated_at
    )
    select
      w.id as workspace_id,
      om.user_id,
      case
        when om.role in ('owner', 'admin') then 'admin'
        else 'member'
      end as role,
      om.status,
      om.created_at,
      om.updated_at
    from organization_memberships om
    join workspaces w on w.organization_id = om.organization_id
    on conflict (workspace_id, user_id) do nothing;
  `);

  pgm.sql(`
    insert into workspace_invites (
      id,
      workspace_id,
      email_normalized,
      role,
      token_hash,
      invited_by_user_id,
      expires_at,
      accepted_at,
      accepted_by_user_id,
      created_at
    )
    select
      i.id,
      w.id as workspace_id,
      i.email_normalized,
      case
        when i.role = 'admin' then 'admin'
        else 'member'
      end as role,
      i.token_hash,
      i.invited_by_user_id,
      i.expires_at,
      i.accepted_at,
      i.accepted_by_user_id,
      i.created_at
    from invites i
    join workspaces w on w.organization_id = i.tenant_id
    on conflict (id) do nothing;
  `);

  pgm.addColumns("agent_threads", {
    workspace_id: {
      type: "text",
      references: "workspaces(id)",
      onDelete: "CASCADE"
    }
  });
  pgm.createIndex("agent_threads", ["workspace_id"], {
    name: "agent_threads_workspace_id_idx"
  });
  pgm.sql(`
    update agent_threads at
    set workspace_id = w.id
    from workspaces w
    where at.workspace_id is null
      and at.tenant_id = w.organization_id;
  `);
  pgm.alterColumn("agent_threads", "workspace_id", {
    notNull: true
  });
}

export async function down(pgm) {
  pgm.alterColumn("agent_threads", "workspace_id", {
    notNull: false
  });
  pgm.dropIndex("agent_threads", ["workspace_id"], {
    name: "agent_threads_workspace_id_idx"
  });
  pgm.dropColumn("agent_threads", "workspace_id");

  pgm.dropTable("workspace_invites");
  pgm.dropTable("workspace_memberships");
  pgm.dropTable("workspaces");
  pgm.dropTable("organization_memberships");
  pgm.dropTable("organizations");
}
