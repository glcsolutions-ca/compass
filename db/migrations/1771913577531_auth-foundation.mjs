export const shorthands = undefined;

export async function up(_pgm) {
  // Compatibility shim for environments that already applied the legacy auth-foundation migration.
}

export async function down(_pgm) {
  // No-op: this migration intentionally preserves historical ordering only.
}
