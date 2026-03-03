import { describe, expect, it } from "vitest";
import { createReleaseCandidate } from "../scripts/generate-release-candidate.mjs";
import { validateReleaseCandidateDocument } from "../../../shared/scripts/pipeline-contract-lib.mjs";

describe("generate-release-candidate", () => {
  it("builds a valid release candidate document", () => {
    const candidate = createReleaseCandidate({
      candidateId: "main-abcdef1-123456",
      repository: "glcsolutions-ca/compass",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      apiImage:
        "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      webImage:
        "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      workerImage:
        "ghcr.io/glcsolutions-ca/compass-worker@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      migrationsArtifact:
        "ghcr.io/glcsolutions-ca/compass-migrations@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      registry: "ghcr.io/glcsolutions-ca",
      commitStageRunId: "123456",
      createdAt: "2026-03-03T18:05:12Z"
    });

    expect(validateReleaseCandidateDocument(candidate)).toHaveLength(0);
    expect(candidate.schemaVersion).toBe("rc.v1");
  });

  it("is deterministic for candidateId and source.revision with the same inputs", () => {
    const first = createReleaseCandidate({
      candidateId: "main-abcdef1-123456",
      repository: "glcsolutions-ca/compass",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      apiImage:
        "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      webImage:
        "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      workerImage:
        "ghcr.io/glcsolutions-ca/compass-worker@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      migrationsArtifact:
        "ghcr.io/glcsolutions-ca/compass-migrations@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      registry: "ghcr.io/glcsolutions-ca",
      commitStageRunId: "123456",
      createdAt: "2026-03-03T18:05:12Z"
    });

    const second = createReleaseCandidate({
      candidateId: "main-abcdef1-123456",
      repository: "glcsolutions-ca/compass",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      apiImage:
        "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      webImage:
        "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      workerImage:
        "ghcr.io/glcsolutions-ca/compass-worker@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      migrationsArtifact:
        "ghcr.io/glcsolutions-ca/compass-migrations@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      registry: "ghcr.io/glcsolutions-ca",
      commitStageRunId: "123456",
      createdAt: "2026-03-03T18:05:12Z"
    });

    expect(first.candidateId).toBe(second.candidateId);
    expect(first.source.revision).toBe(second.source.revision);
  });
});
