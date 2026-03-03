import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { verifyAcceptanceEvidence } from "../scripts/verify-acceptance-evidence.mjs";

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function baseEvidence(overrides = {}) {
  return {
    schemaVersion: "acceptance-evidence.v1",
    candidateId: "main-abcdef1-123456",
    sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    workflowRunId: "123456",
    environment: "acceptance",
    verdict: "pass",
    startedAt: "2026-03-03T07:00:00Z",
    finishedAt: "2026-03-03T07:05:00Z",
    summary: "Acceptance passed",
    ...overrides
  };
}

describe("verify-acceptance-evidence", () => {
  it("accepts matching pass evidence", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verify-acceptance-pass-"));
    await writeJson(path.join(root, "acceptance-evidence.json"), baseEvidence());

    await expect(
      verifyAcceptanceEvidence({
        evidenceDirectory: root,
        candidateId: "main-abcdef1-123456",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    ).resolves.toMatchObject({
      verdict: "pass"
    });
  });

  it("fails on sourceRevision mismatch", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verify-acceptance-mismatch-"));
    await writeJson(path.join(root, "acceptance-evidence.json"), baseEvidence());

    await expect(
      verifyAcceptanceEvidence({
        evidenceDirectory: root,
        candidateId: "main-abcdef1-123456",
        sourceRevision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      })
    ).rejects.toThrow(/sourceRevision mismatch/);
  });

  it("fails when verdict is not pass", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "verify-acceptance-fail-"));
    await writeJson(path.join(root, "acceptance-evidence.json"), baseEvidence({ verdict: "fail" }));

    await expect(
      verifyAcceptanceEvidence({
        evidenceDirectory: root,
        candidateId: "main-abcdef1-123456",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    ).rejects.toThrow(/verdict=fail/);
  });
});
