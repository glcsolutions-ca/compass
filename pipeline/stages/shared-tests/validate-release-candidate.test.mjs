import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validateReleaseCandidateFile } from "../../shared/scripts/validate-release-candidate.mjs";

function baseManifest() {
  return {
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
}

async function writeManifest(document) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "rc-validate-test-"));
  const filePath = path.join(tempDir, "manifest.json");
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return filePath;
}

describe("validate-release-candidate", () => {
  it("passes a valid release candidate manifest", async () => {
    const filePath = await writeManifest(baseManifest());
    const errors = await validateReleaseCandidateFile(filePath);
    expect(errors).toHaveLength(0);
  });

  it("fails when artifacts.webImage is missing", async () => {
    const manifest = baseManifest();
    delete manifest.artifacts.webImage;

    const filePath = await writeManifest(manifest);
    const errors = await validateReleaseCandidateFile(filePath);
    expect(errors.some((entry) => entry.path === "$.artifacts.webImage")).toBe(true);
  });

  it("fails when tag is used instead of digest", async () => {
    const manifest = baseManifest();
    manifest.artifacts.apiImage = "ghcr.io/glcsolutions-ca/compass-api:latest";

    const filePath = await writeManifest(manifest);
    const errors = await validateReleaseCandidateFile(filePath);
    expect(errors.some((entry) => entry.path === "$.artifacts.apiImage")).toBe(true);
  });

  it("fails when schemaVersion is unsupported", async () => {
    const manifest = baseManifest();
    manifest.schemaVersion = "rc.v2";

    const filePath = await writeManifest(manifest);
    const errors = await validateReleaseCandidateFile(filePath);
    expect(errors.some((entry) => entry.path === "$.schemaVersion")).toBe(true);
  });

  it("fails when candidateId is empty", async () => {
    const manifest = baseManifest();
    manifest.candidateId = "";

    const filePath = await writeManifest(manifest);
    const errors = await validateReleaseCandidateFile(filePath);
    expect(errors.some((entry) => entry.path === "$.candidateId")).toBe(true);
  });
});
