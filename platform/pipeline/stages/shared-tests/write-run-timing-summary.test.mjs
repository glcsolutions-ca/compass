import { describe, expect, it } from "vitest";
import { buildTimingSummary } from "../../shared/scripts/write-run-timing-summary.mjs";

function createJob(name, startedAt, completedAt, conclusion = "success") {
  return {
    name,
    started_at: startedAt,
    completed_at: completedAt,
    conclusion
  };
}

describe("write-run-timing-summary", () => {
  it("reports budgets and breaches with stage durations", () => {
    const summary = buildTimingSummary({
      headline: "Release Stage Timing",
      jobs: [
        createJob("Commit Stage / Unit Tests", "2026-03-10T04:00:00Z", "2026-03-10T04:03:00Z"),
        createJob("Acceptance Stage / API", "2026-03-10T04:03:30Z", "2026-03-10T04:08:45Z"),
        createJob(
          "Release Stage / Deploy Production",
          "2026-03-10T04:09:00Z",
          "2026-03-10T04:20:30Z"
        )
      ],
      budgets: {
        totalLeadTimeMs: 15 * 60_000,
        commitStageMs: 5 * 60_000,
        acceptanceStageMs: 5 * 60_000,
        releaseStageMs: 10 * 60_000
      }
    });

    expect(summary.sections).toContain("- Commit Stage: 3m 0s");
    expect(summary.sections).toContain("- Acceptance Stage: 5m 15s");
    expect(summary.sections).toContain("- Release Stage: 11m 30s");
    expect(summary.sections).toContain("  - Commit Stage: 3m 0s / 5m 0s (within budget)");
    expect(summary.sections).toContain("  - Total lead time: 20m 30s / 15m 0s (exceeded)");
    expect(summary.sections).toContain("  - Acceptance Stage: 5m 15s / 5m 0s (exceeded)");
    expect(summary.sections).toContain("  - Release Stage: 11m 30s / 10m 0s (exceeded)");
    expect(summary.sections).toContain("  - Total lead time exceeded 15m 0s");
    expect(summary.sections).toContain("  - Acceptance Stage exceeded 5m 0s");
    expect(summary.sections).toContain("  - Release Stage exceeded 10m 0s");
    expect(summary.exceededBudgets).toHaveLength(3);
  });

  it("includes line-stop messaging when the stage path failed", () => {
    const summary = buildTimingSummary({
      headline: "Commit Stage Timing",
      lineStop: true,
      jobs: [
        createJob("Commit Stage / Unit Tests", "2026-03-10T04:00:00Z", "2026-03-10T04:01:00Z", "failure")
      ]
    });

    expect(summary.sections).toContain("- Failed jobs:");
    expect(summary.sections).toContain("  - Commit Stage / Unit Tests (failure)");
    expect(summary.sections).toContain(
      "`main` is red. Stop the line and fix forward before integrating more changes."
    );
  });
});
