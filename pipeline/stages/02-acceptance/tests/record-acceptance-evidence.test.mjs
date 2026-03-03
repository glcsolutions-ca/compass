import { describe, expect, it } from "vitest";
import { createAcceptanceEvidence } from "../scripts/record-acceptance-evidence.mjs";

describe("record-acceptance-evidence", () => {
  it("creates valid acceptance evidence", () => {
    const evidence = createAcceptanceEvidence({
      candidateId: "main-abcdef1-123456",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      verdict: "pass",
      startedAt: "2026-03-03T18:05:12Z",
      finishedAt: "2026-03-03T18:10:12Z",
      summary: "Acceptance checks passed"
    });

    expect(evidence.schemaVersion).toBe("acceptance-evidence.v1");
    expect(evidence.environment).toBe("acceptance");
    expect(evidence.verdict).toBe("pass");
  });

  it("fails for invalid verdict", () => {
    expect(() =>
      createAcceptanceEvidence({
        candidateId: "main-abcdef1-123456",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        workflowRunId: "123456",
        verdict: "unknown",
        startedAt: "2026-03-03T18:05:12Z",
        finishedAt: "2026-03-03T18:10:12Z",
        summary: "Acceptance checks failed"
      })
    ).toThrow(/verdict/);
  });
});
