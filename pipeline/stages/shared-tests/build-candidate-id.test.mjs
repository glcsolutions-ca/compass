import { describe, expect, it } from "vitest";
import { computeCandidateId } from "../../shared/scripts/build-candidate-id.mjs";

describe("build-candidate-id", () => {
  it("creates deterministic candidate ids from source revision and run id", () => {
    const candidateId = computeCandidateId({
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      runId: "123456"
    });

    expect(candidateId).toBe("main-aaaaaaa-123456");
  });

  it("rejects invalid source revisions", () => {
    expect(() =>
      computeCandidateId({
        sourceRevision: "abc",
        runId: "123456"
      })
    ).toThrow(/sourceRevision/);
  });
});
