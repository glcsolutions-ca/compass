import { describe, expect, it } from "vitest";
import { evaluateCommitStageSlo } from "./enforce-commit-stage-slo.mjs";

describe("enforce-commit-stage-slo", () => {
  it("returns pass when duration is within warning threshold", () => {
    const result = evaluateCommitStageSlo({
      start: "2026-03-03T07:00:00Z",
      end: "2026-03-03T07:03:20Z",
      warnSeconds: 300,
      failSeconds: 600
    });

    expect(result.verdict).toBe("pass");
    expect(result.durationSeconds).toBe(200);
  });

  it("returns warn when duration exceeds warning threshold", () => {
    const result = evaluateCommitStageSlo({
      start: "2026-03-03T07:00:00Z",
      end: "2026-03-03T07:06:01Z",
      warnSeconds: 300,
      failSeconds: 600
    });

    expect(result.verdict).toBe("warn");
    expect(result.durationSeconds).toBe(361);
  });

  it("returns fail when duration exceeds failure threshold", () => {
    const result = evaluateCommitStageSlo({
      start: "2026-03-03T07:00:00Z",
      end: "2026-03-03T07:11:15Z",
      warnSeconds: 300,
      failSeconds: 600
    });

    expect(result.verdict).toBe("fail");
    expect(result.durationSeconds).toBe(675);
  });

  it("throws when warn threshold is not less than fail threshold", () => {
    expect(() =>
      evaluateCommitStageSlo({
        start: "2026-03-03T07:00:00Z",
        end: "2026-03-03T07:01:00Z",
        warnSeconds: 600,
        failSeconds: 600
      })
    ).toThrow(/warn-seconds must be less than fail-seconds/);
  });
});
