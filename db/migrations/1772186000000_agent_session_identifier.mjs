export async function up(pgm) {
  pgm.renameColumn("agent_threads", "cloud_session_identifier", "session_identifier");
  pgm.sql(
    'alter index if exists "agent_threads_cloud_session_identifier_uidx" rename to "agent_threads_session_identifier_uidx";'
  );
}

export async function down(pgm) {
  pgm.sql(
    'alter index if exists "agent_threads_session_identifier_uidx" rename to "agent_threads_cloud_session_identifier_uidx";'
  );
  pgm.renameColumn("agent_threads", "session_identifier", "cloud_session_identifier");
}
