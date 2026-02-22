export const DEFAULT_DATABASE_URL = "postgres://compass:compass@localhost:5432/compass";

export function resolveDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}
