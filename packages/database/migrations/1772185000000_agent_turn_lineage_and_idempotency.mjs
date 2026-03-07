export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumns("agent_turns", {
    parent_turn_id: {
      type: "text"
    },
    source_turn_id: {
      type: "text"
    },
    client_request_id: {
      type: "text"
    }
  });

  pgm.createIndex("agent_turns", ["thread_id", "parent_turn_id"], {
    name: "agent_turns_thread_parent_idx",
    where: "parent_turn_id is not null"
  });

  pgm.createIndex("agent_turns", ["thread_id", "source_turn_id"], {
    name: "agent_turns_thread_source_idx",
    where: "source_turn_id is not null"
  });

  pgm.createIndex("agent_turns", ["thread_id", "client_request_id"], {
    name: "agent_turns_thread_client_request_uidx",
    unique: true,
    where: "client_request_id is not null"
  });
}

export async function down(pgm) {
  pgm.dropIndex("agent_turns", ["thread_id", "client_request_id"], {
    name: "agent_turns_thread_client_request_uidx"
  });

  pgm.dropIndex("agent_turns", ["thread_id", "source_turn_id"], {
    name: "agent_turns_thread_source_idx"
  });

  pgm.dropIndex("agent_turns", ["thread_id", "parent_turn_id"], {
    name: "agent_turns_thread_parent_idx"
  });

  pgm.dropColumns("agent_turns", ["client_request_id", "source_turn_id", "parent_turn_id"]);
}
