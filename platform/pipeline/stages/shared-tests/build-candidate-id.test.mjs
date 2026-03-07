import { describe, expect, it } from "vitest";
import { computeCandidateId } from "../../shared/scripts/build-candidate-id.mjs";

describe("build-candidate-id", () => {
  it("creates deterministic candidate ids from source revision", () => {
    const candidateId = computeCandidateId({
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    });

    expect(candidateId).toBe("sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("rejects invalid source revisions", () => {
    expect(() =>
      computeCandidateId({
        sourceRevision: "abc"
      })
    ).toThrow(/sourceRevision/);
  });
});
