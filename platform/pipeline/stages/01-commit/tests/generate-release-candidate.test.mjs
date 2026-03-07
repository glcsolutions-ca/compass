import { describe, expect, it } from "vitest";
import { createReleaseCandidate } from "../scripts/generate-release-candidate.mjs";
import { validateReleaseCandidateDocument } from "../../../shared/scripts/pipeline-contract-lib.mjs";

describe("generate-release-candidate", () => {
  it("builds a valid release candidate document", () => {
    const candidate = createReleaseCandidate({
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      repository: "glcsolutions-ca/compass",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      apiImage:
        "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      webImage:
        "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      migrationsArtifact:
        "ghcr.io/glcsolutions-ca/compass-migrations@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      registry: "ghcr.io/glcsolutions-ca",
      commitStageRunId: "123456",
      releaseUnitDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      createdAt: "2026-03-03T18:05:12Z"
    });

    expect(validateReleaseCandidateDocument(candidate)).toHaveLength(0);
    expect(candidate.provenance.releaseUnitDigest).toBe(
      "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    );
  });

  it("is deterministic for candidateId and source.revision with the same inputs", () => {
    const options = {
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      repository: "glcsolutions-ca/compass",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      apiImage:
        "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      webImage:
        "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      migrationsArtifact:
        "ghcr.io/glcsolutions-ca/compass-migrations@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      registry: "ghcr.io/glcsolutions-ca",
      commitStageRunId: "123456",
      releaseUnitDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      createdAt: "2026-03-03T18:05:12Z"
    };

    const first = createReleaseCandidate(options);
    const second = createReleaseCandidate(options);
    expect(first.candidateId).toBe(second.candidateId);
    expect(first.source.revision).toBe(second.source.revision);
  });

  it("rejects an invalid optional release-unit digest", () => {
    expect(() =>
      createReleaseCandidate({
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        repository: "glcsolutions-ca/compass",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        apiImage:
          "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        webImage:
          "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        migrationsArtifact:
          "ghcr.io/glcsolutions-ca/compass-migrations@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        registry: "ghcr.io/glcsolutions-ca",
        commitStageRunId: "123456",
        releaseUnitDigest: "sha256:not-a-real-digest",
        createdAt: "2026-03-03T18:05:12Z"
      })
    ).toThrow(/Generated release candidate is invalid/);
  });
});
