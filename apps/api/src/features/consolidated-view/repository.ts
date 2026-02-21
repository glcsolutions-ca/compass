import type { ConsolidatedEmployeeView } from "@compass/contracts";
import { calculateFreshnessLagSeconds } from "./freshness-lag.js";

export interface ConsolidatedViewRepository {
  getByEmployeeId(employeeId: string, now?: Date): Promise<ConsolidatedEmployeeView | null>;
}

function buildDemoView(now: Date, employeeId: string): ConsolidatedEmployeeView {
  const asOf = new Date(now.getTime() - 30_000).toISOString();

  return {
    employeeId,
    asOf,
    freshnessLagSeconds: calculateFreshnessLagSeconds(asOf, now),
    sourceSystems: [
      {
        name: "jira",
        status: "healthy",
        lastSyncedAt: new Date(now.getTime() - 20_000).toISOString()
      },
      {
        name: "legacy-erp",
        status: "healthy",
        lastSyncedAt: new Date(now.getTime() - 35_000).toISOString()
      }
    ],
    timeEntries: [
      {
        id: "te-1001",
        sourceSystem: "jira",
        workPackageId: "wp-42",
        date: "2026-02-20",
        hours: 4.5,
        lastUpdatedAt: new Date(now.getTime() - 32_000).toISOString()
      }
    ],
    workPackages: [
      {
        id: "wp-42",
        sourceSystem: "legacy-erp",
        name: "Migration Sprint A",
        status: "active",
        assignedAt: "2026-02-01T09:00:00.000Z",
        lastUpdatedAt: new Date(now.getTime() - 40_000).toISOString()
      }
    ]
  };
}

export class InMemoryConsolidatedViewRepository implements ConsolidatedViewRepository {
  private readonly data: Map<string, ConsolidatedEmployeeView>;

  constructor(seedNow: Date = new Date()) {
    this.data = new Map([
      ["employee-123", buildDemoView(seedNow, "employee-123")],
      ["employee-admin", buildDemoView(seedNow, "employee-admin")]
    ]);
  }

  async getByEmployeeId(
    employeeId: string,
    now: Date = new Date()
  ): Promise<ConsolidatedEmployeeView | null> {
    const view = this.data.get(employeeId);

    if (!view) {
      return null;
    }

    return {
      ...view,
      freshnessLagSeconds: calculateFreshnessLagSeconds(view.asOf, now)
    };
  }
}
