import { describe, expect, it } from "vitest";
import {
  validateAcceptanceAttestationPredicateDocument,
  validateProductionRehearsalEvidenceDocument,
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

    const helperValid = validateAcceptanceAttestationPredicateDocument(attestation).length === 0;
    const schemaValid =
      validateBySchema("acceptanceAttestationPredicate", attestation).length === 0;
    expect(helperValid).toBe(schemaValid);
  });

  it("keeps rehearsal evidence helper verdict parity with schema validator", () => {
    const evidence = {
      schemaVersion: "production-rehearsal-evidence.v1",
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      rehearsedAt: "2026-03-03T18:28:12Z",
      verdict: "pass",
      environment: "production-rehearsal",
      activeLabel: "green",
      inactiveLabel: "blue",
      apiBaseUrl: "https://ca-compass-api-prd-cc-02---blue.example.com",
      webBaseUrl: "https://ca-compass-web-prd-cc-02---blue.example.com",
      apiRevision: "ca-compass-api-prd-cc-02--api-aaaaaaaaaaaaaaaaaaaaaaaa",
      webRevision: "ca-compass-web-prd-cc-02--web-aaaaaaaaaaaaaaaaaaaaaaaa",
      summary: "deploy=0 verify=0"
    };

    const helperValid = validateProductionRehearsalEvidenceDocument(evidence).length === 0;
    const schemaValid = validateBySchema("productionRehearsalEvidence", evidence).length === 0;
    expect(helperValid).toBe(schemaValid);
  });

  it("keeps release attestation helper verdict parity with schema validator", () => {
    const attestation = {
      schemaVersion: "release-attestation.v1",
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      verdict: "pass",
      releasedAt: "2026-03-03T18:30:12Z",
      environment: "production",
      deploymentRef: "https://github.com/glcsolutions-ca/compass/actions/runs/123456"
    };

    const helperValid = validateReleaseAttestationPredicateDocument(attestation).length === 0;
    const schemaValid = validateBySchema("releaseAttestationPredicate", attestation).length === 0;
    expect(helperValid).toBe(schemaValid);
  });
});
