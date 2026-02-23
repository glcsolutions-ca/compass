export const shorthands = undefined;

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS consolidated_employee_views (
      employee_id text PRIMARY KEY NOT NULL,
      view_data jsonb NOT NULL,
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS consolidated_employee_views_updated_at_idx
      ON consolidated_employee_views (updated_at)
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS consolidated_employee_views_view_data_gin_idx
      ON consolidated_employee_views
      USING gin (view_data jsonb_path_ops)
  `);
};

export const down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS consolidated_employee_views");
};
