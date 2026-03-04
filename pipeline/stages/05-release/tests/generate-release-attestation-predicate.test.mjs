import { describe, expect, it } from "vitest";
import { createReleaseAttestationPredicate } from "../scripts/generate-release-attestation-predicate.mjs";

describe("generate-release-attestation-predicate", () => {
  it("creates a valid release attestation predicate", () => {
    const predicate = createReleaseAttestationPredicate({
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verdict: "pass",
      workflowRunId: "123456",
      releasedAt: "2026-03-03T18:20:12Z",
      deploymentRef: "https://github.com/glcsolutions-ca/compass/actions/runs/1"
    });

    expect(predicate.schemaVersion).toBe("release-attestation.v1");
    expect(predicate.environment).toBe("production");
  });

  it("rejects missing deploymentRef", () => {
    expect(() =>
      createReleaseAttestationPredicate({
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        verdict: "pass",
        workflowRunId: "123456",
        releasedAt: "2026-03-03T18:20:12Z",
        deploymentRef: ""
      })
    ).toThrow(/Release attestation predicate is invalid/);
  });
});
