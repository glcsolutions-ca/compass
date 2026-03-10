import { describe, expect, it } from "vitest";
import { validateReleaseCandidateDocument } from "../../shared/scripts/pipeline-contract-lib.mjs";
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
});
