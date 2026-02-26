export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumns("invites", {
    accepted_by_user_id: {
      type: "text",
      references: "users(id)",
      onDelete: "SET NULL"
    }
  });
  pgm.createIndex("invites", ["accepted_by_user_id"]);

  pgm.sql(`
    update users
    set primary_email = null,
        updated_at = current_timestamp
    where primary_email is not null
      and primary_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'
  `);
}

export async function down(pgm) {
  pgm.dropIndex("invites", ["accepted_by_user_id"]);
  pgm.dropColumns("invites", ["accepted_by_user_id"]);
}
