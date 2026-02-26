export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    alter table invites
    add constraint invites_acceptance_consistency_check
    check (
      (accepted_at is null and accepted_by_user_id is null)
      or (accepted_at is not null and accepted_by_user_id is not null)
    ) not valid
  `);
}

export async function down(pgm) {
  pgm.dropConstraint("invites", "invites_acceptance_consistency_check");
}
