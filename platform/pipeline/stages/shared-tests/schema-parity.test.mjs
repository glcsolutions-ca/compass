import { describe, expect, it } from "vitest";
import {
  validateAcceptanceAttestationPredicateDocument,
  validateReleaseCandidateDocument,
  validateReleaseAttestationPredicateDocument
} from "../../shared/scripts/pipeline-contract-lib.mjs";
import { validateBySchema } from "../../shared/scripts/schema-validator.mjs";

describe("schema parity", () => {
  it("keeps release candidate helper verdict parity with schema validator", () => {
    const candidate = {
      schemaVersion: "rc.v1",
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      source: {
        repository: "glcsolutions-ca/compass",
        revision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        createdAt: "2026-03-03T18:05:12Z"
      },
      artifacts: {
        apiImage:
          "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        webImage:
          "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      },
      provenance: {
        commitStageRunId: "123456",
        registry: "ghcr.io/glcsolutions-ca"
      }
    };

    expect(validateReleaseCandidateDocument(candidate).length === 0).toBe(
      validateBySchema("releaseCandidate", candidate).length === 0
    );
  });

  it("keeps acceptance attestation helper verdict parity with schema validator", () => {
    const attestation = {
      schemaVersion: "acceptance-attestation.v1",
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      verdict: "pass",
      testedAt: "2026-03-03T18:25:12Z",
      suiteSummary: "system=pass browser=pass"
    };

    expect(validateAcceptanceAttestationPredicateDocument(attestation).length === 0).toBe(
      validateBySchema("acceptanceAttestationPredicate", attestation).length === 0
    );
  });

  it("keeps release attestation helper verdict parity with schema validator", () => {
    const attestation = {
      schemaVersion: "release-attestation.v2",
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      verdict: "pass",
      releasedAt: "2026-03-03T18:30:12Z",
      environment: "production",
      deploymentRef: "https://github.com/glcsolutions-ca/compass/actions/runs/123456",
      apiImage:
        "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      webImage:
        "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      stageApiBaseUrl: "https://api-stage.example.com",
      stageWebBaseUrl: "https://web-stage.example.com",
      stageSmokeVerdict: "pass",
      productionWebBaseUrl: "https://compass.glcsolutions.ca",
      productionSmokeVerdict: "pass"
    };

    expect(validateReleaseAttestationPredicateDocument(attestation).length === 0).toBe(
      validateBySchema("releaseAttestationPredicate", attestation).length === 0
    );
  });
});
