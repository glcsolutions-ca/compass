export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable("auth_desktop_handoffs", {
    id: { type: "text", primaryKey: true },
    handoff_token_hash: { type: "text", notNull: true },
    user_id: {
      type: "text",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE"
    },
    redirect_to: { type: "text", notNull: true },
    expires_at: { type: "timestamp with time zone", notNull: true },
    consumed_at: { type: "timestamp with time zone" },
    created_at: {
      type: "timestamp with time zone",
      notNull: true,
      default: pgm.func("current_timestamp")
    }
  });

  pgm.addConstraint("auth_desktop_handoffs", "auth_desktop_handoffs_unique_token_hash", {
    unique: ["handoff_token_hash"]
  });
  pgm.createIndex("auth_desktop_handoffs", ["expires_at"]);
}

export async function down(pgm) {
  pgm.dropTable("auth_desktop_handoffs");
}
