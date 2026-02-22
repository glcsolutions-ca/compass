import { type ConsolidatedEmployeeView, ConsolidatedEmployeeViewSchema } from "@compass/contracts";
import { calculateFreshnessLagSeconds } from "./freshness-lag.js";
import type { ConsolidatedViewRepository } from "./repository.js";

interface PostgresConsolidatedViewRepositoryOptions {
  query: (queryText: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
}

interface ConsolidatedViewRow {
  view_data: unknown;
}

export class PostgresConsolidatedViewRepository implements ConsolidatedViewRepository {
  private readonly query: (queryText: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;

  constructor(options: PostgresConsolidatedViewRepositoryOptions) {
    this.query = options.query;
  }

  async getByEmployeeId(
    employeeId: string,
    now: Date = new Date()
  ): Promise<ConsolidatedEmployeeView | null> {
    const result = await this.query(
      `
        SELECT view_data
        FROM consolidated_employee_views
        WHERE employee_id = $1
      `,
      [employeeId]
    );
    const row = result.rows.at(0) as ConsolidatedViewRow | undefined;
    if (!row) {
      return null;
    }

    const view = ConsolidatedEmployeeViewSchema.parse(row.view_data);
    return {
      ...view,
      freshnessLagSeconds: calculateFreshnessLagSeconds(view.asOf, now)
    };
  }
}
