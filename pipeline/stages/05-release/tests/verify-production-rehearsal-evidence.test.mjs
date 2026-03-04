import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { verifyProductionRehearsalEvidence } from "../scripts/verify-production-rehearsal-evidence.mjs";

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function baseEvidence(overrides = {}) {
  return {
    schemaVersion: "production-rehearsal-evidence.v1",
    stage: "production-rehearsal",
    candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    workflowRunId: "123456",
    environment: "production",
    verdict: "pass",
    startedAt: "2026-03-03T11:00:00Z",
    finishedAt: "2026-03-03T11:10:00Z",
    summary: "Rehearsal passed",
    deployment: {
      resourceGroup: "rg-compass",
      zeroTraffic: true,
      apps: {
        api: {
          appName: "api-app",
          candidateRevision: "api--abc",
          previousRevision: "api--prev",
          candidateImage:
            "ghcr.io/glcsolutions-ca/compass-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        web: {
          appName: "web-app",
          candidateRevision: "web--abc",
          previousRevision: "web--prev",
          candidateImage:
            "ghcr.io/glcsolutions-ca/compass-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        },
        worker: {
          appName: "worker-app",
          candidateRevision: "worker--abc",
          previousRevision: "worker--prev",
          candidateImage:
            "ghcr.io/glcsolutions-ca/compass-worker@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        }
      }
    },
    ...overrides
  };
}

describe("verify-production-rehearsal-evidence", () => {
  it("accepts matching pass evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verify-prod-rehearsal-pass-"));
    await writeJson(path.join(root, "production-rehearsal-evidence.json"), baseEvidence());

    await expect(
      verifyProductionRehearsalEvidence({
        evidenceDirectory: root,
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    ).resolves.toMatchObject({ verdict: "pass" });
  });

  it("fails when verdict is not pass", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verify-prod-rehearsal-fail-"));
    await writeJson(
      path.join(root, "production-rehearsal-evidence.json"),
      baseEvidence({ verdict: "fail" })
    );

    await expect(
      verifyProductionRehearsalEvidence({
        evidenceDirectory: root,
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    ).rejects.toThrow(/not passed production rehearsal/);
  });
});
