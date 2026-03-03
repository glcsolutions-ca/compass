import os from "node:os";
import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createProductionRehearsalEvidence } from "../scripts/record-production-rehearsal-evidence.mjs";

async function writeDeployState(payload) {
  const root = await mkdtemp(path.join(os.tmpdir(), "prod-rehearsal-state-"));
  const filePath = path.join(root, "deploy-state.json");
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

function baseDeployState() {
  return {
    resourceGroup: "rg-compass",
    zeroTraffic: true,
    deployment: {
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
  };
}

describe("record-production-rehearsal-evidence", () => {
  it("creates valid evidence from deployment state", async () => {
    const deployStatePath = await writeDeployState(baseDeployState());

    const evidence = await createProductionRehearsalEvidence({
      deployStatePath,
      candidateId: "main-abcdef1-123456",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      verdict: "pass",
      startedAt: "2026-03-03T10:00:00Z",
      finishedAt: "2026-03-03T10:10:00Z",
      summary: "Production rehearsal pass"
    });

    expect(evidence.schemaVersion).toBe("production-rehearsal-evidence.v1");
    expect(evidence.deployment.apps.api.candidateRevision).toBe("api--abc");
    expect(evidence.verdict).toBe("pass");
  });
});
