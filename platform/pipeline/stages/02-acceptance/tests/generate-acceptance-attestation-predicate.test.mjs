import { describe, expect, it } from "vitest";
import { createAcceptanceAttestationPredicate } from "../scripts/generate-acceptance-attestation-predicate.mjs";

describe("generate-acceptance-attestation-predicate", () => {
  it("creates a valid acceptance attestation predicate", () => {
    const predicate = createAcceptanceAttestationPredicate({
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verdict: "pass",
      workflowRunId: "123456",
      testedAt: "2026-03-03T18:05:12Z",
      suiteSummary: "system=pass browser=pass"
    });

    expect(predicate.schemaVersion).toBe("acceptance-attestation.v1");
    expect(predicate.verdict).toBe("pass");
  });

  it("rejects unsupported verdicts", () => {
    expect(() =>
      createAcceptanceAttestationPredicate({
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        verdict: "warn",
        workflowRunId: "123456",
        testedAt: "2026-03-03T18:05:12Z",
        suiteSummary: "invalid verdict"
      })
    ).toThrow(/Acceptance attestation predicate is invalid/);
  });
});
