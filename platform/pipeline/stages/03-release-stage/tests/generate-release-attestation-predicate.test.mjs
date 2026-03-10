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
      deploymentRef: "https://github.com/glcsolutions-ca/compass/actions/runs/1",
      apiImage:
        "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      webImage:
        "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      stageApiBaseUrl: "https://api-stage.example.com",
      stageWebBaseUrl: "https://web-stage.example.com",
      stageSmokeVerdict: "pass",
      productionWebBaseUrl: "https://compass.glcsolutions.ca",
      productionSmokeVerdict: "pass"
    });

    expect(predicate.schemaVersion).toBe("release-attestation.v2");
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
        deploymentRef: "",
        apiImage:
          "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        webImage:
          "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        stageApiBaseUrl: "https://api-stage.example.com",
        stageWebBaseUrl: "https://web-stage.example.com",
        stageSmokeVerdict: "pass",
        productionWebBaseUrl: "https://compass.glcsolutions.ca",
        productionSmokeVerdict: "pass"
      })
    ).toThrow(/Release attestation predicate is invalid/);
  });
});
