import {
  up as upAuthFoundation,
  down as downAuthFoundation
} from "../migration-baseline/auth-foundation.mjs";
import {
  up as upCodexGatewayTables,
  down as downCodexGatewayTables
} from "../migration-baseline/codex-gateway-tables.mjs";

export const shorthands = undefined;

export async function up(pgm) {
  upAuthFoundation(pgm);
  await upCodexGatewayTables(pgm);

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
  await downCodexGatewayTables(pgm);
  downAuthFoundation(pgm);
}
