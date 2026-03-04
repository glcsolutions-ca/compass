import { describe, expect, it } from "vitest";
import { validateReleaseCandidateRuntimeDocument } from "../../shared/scripts/validate-release-candidate-runtime.mjs";

function baseManifest() {
  return {
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
      registry: "ghcr.io/glcsolutions-ca",
      releaseUnitDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    }
  };
}

describe("validate-release-candidate-runtime", () => {
  it("passes a valid release candidate manifest", () => {
    const errors = validateReleaseCandidateRuntimeDocument(baseManifest());
    expect(errors).toHaveLength(0);
  });

  it("fails invalid provenance.releaseUnitDigest", () => {
    const manifest = baseManifest();
    manifest.provenance.releaseUnitDigest = "sha256:bad";

    const errors = validateReleaseCandidateRuntimeDocument(manifest);
    expect(errors.some((entry) => entry.path === "$.provenance.releaseUnitDigest")).toBe(true);
  });

  it("fails unknown top-level keys", () => {
    const manifest = baseManifest();
    manifest.unexpected = true;

    const errors = validateReleaseCandidateRuntimeDocument(manifest);
    expect(errors.some((entry) => entry.path === "$.unexpected")).toBe(true);
  });
});
