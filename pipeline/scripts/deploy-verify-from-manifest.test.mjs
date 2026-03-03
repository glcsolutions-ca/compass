import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { deployFromManifest } from "./deploy-from-manifest.mjs";
import { verifyFromManifest } from "./verify-from-manifest.mjs";

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "rc-deploy-verify-test-"));
  const filePath = path.join(tempDir, "manifest.json");
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return filePath;
}

describe("manifest command contracts", () => {
  it("passes deploy and verify with a valid manifest", async () => {
    const filePath = await writeManifest(baseManifest());

    await expect(
      deployFromManifest({
        environment: "acceptance",
        manifestPath: filePath
      })
    ).resolves.toBeUndefined();

    await expect(
      verifyFromManifest({
        environment: "production",
        manifestPath: filePath
      })
    ).resolves.toBeUndefined();
  });

  it("fails when manifest does not use digest-pinned refs", async () => {
    const manifest = baseManifest();
    manifest.artifacts.apiImage = "ghcr.io/glcsolutions-ca/compass-api:latest";
    const filePath = await writeManifest(manifest);

    await expect(
      deployFromManifest({
        environment: "acceptance",
        manifestPath: filePath
      })
    ).rejects.toThrow(/Manifest validation failed/);
  });
});
