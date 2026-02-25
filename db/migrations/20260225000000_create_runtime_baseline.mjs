export const shorthands = undefined;

export async function up(pgm) {
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
}
