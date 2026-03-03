import { describe, expect, it } from "vitest";
import {
  validateAcceptanceEvidenceDocument,
  validateReleaseCandidateDocument,
  validateReleaseEvidenceDocument
} from "../../shared/scripts/pipeline-contract-lib.mjs";
import { validateBySchema } from "../../shared/scripts/schema-validator.mjs";

describe("schema parity", () => {
  it("keeps release candidate helper verdict parity with schema validator", () => {
    const candidate = {
      schemaVersion: "rc.v1",
      candidateId: "main-abcdef1-123456",
      source: {
        repository: "glcsolutions-ca/compass",
        revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdAt: "2026-03-03T18:05:12Z"
      },
      artifacts: {
        apiImage:
          "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        webImage:
          "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        workerImage:
          "ghcr.io/glcsolutions-ca/compass-worker@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        migrationsArtifact:
          "ghcr.io/glcsolutions-ca/compass-migrations@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      },
      provenance: {
        commitStageRunId: "123456",
        registry: "ghcr.io/glcsolutions-ca"
      }
    };

    const helperValid = validateReleaseCandidateDocument(candidate).length === 0;
    const schemaValid = validateBySchema("releaseCandidate", candidate).length === 0;
    expect(helperValid).toBe(schemaValid);
  });

  it("keeps acceptance evidence helper verdict parity with schema validator", () => {
    const evidence = {
      schemaVersion: "acceptance-evidence.v1",
      candidateId: "main-abcdef1-123456",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      environment: "acceptance",
      verdict: "pass",
      startedAt: "2026-03-03T18:05:12Z",
      finishedAt: "2026-03-03T18:10:12Z",
      summary: "Acceptance passed"
    };

    const helperValid = validateAcceptanceEvidenceDocument(evidence).length === 0;
    const schemaValid = validateBySchema("acceptanceEvidence", evidence).length === 0;
    expect(helperValid).toBe(schemaValid);
  });

  it("keeps release evidence helper verdict parity with schema validator", () => {
    const evidence = {
      schemaVersion: "release-evidence.v1",
      candidateId: "main-abcdef1-123456",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      environment: "production",
      verdict: "pass",
      releasedAt: "2026-03-03T18:20:12Z",
      summary: "Release passed"
    };

    const helperValid = validateReleaseEvidenceDocument(evidence).length === 0;
    const schemaValid = validateBySchema("releaseEvidence", evidence).length === 0;
    expect(helperValid).toBe(schemaValid);
  });
});
