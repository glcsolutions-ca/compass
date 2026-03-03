import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolvePulledManifestPath } from "../../shared/scripts/fetch-release-candidate.mjs";

function buildManifest() {
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

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

describe("fetch-release-candidate resolvePulledManifestPath", () => {
  it("resolves nested manifest path from pulled artifacts", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fetch-rc-nested-"));
    const nestedManifest = path.join(root, ".artifacts", "release-candidate", "manifest.json");
    await writeJson(nestedManifest, buildManifest());

    const resolved = await resolvePulledManifestPath(root);
    expect(resolved).toBe(nestedManifest);
  });

  it("finds a valid release-candidate document without a .json extension", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fetch-rc-generic-"));
    const genericName = path.join(root, "blob");
    await writeJson(genericName, buildManifest());

    const resolved = await resolvePulledManifestPath(root);
    expect(resolved).toBe(genericName);
  });
});
