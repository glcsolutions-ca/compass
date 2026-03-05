import { describe, expect, it } from "vitest";
import { createProductionRehearsalEvidence } from "../scripts/record-production-rehearsal-evidence.mjs";

describe("record-production-rehearsal-evidence", () => {
  it("creates a valid rehearsal evidence document", () => {
    const document = createProductionRehearsalEvidence({
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      workflowRunId: "123456",
      rehearsedAt: "2026-03-05T16:00:00Z",
      verdict: "pass",
      activeLabel: "green",
      inactiveLabel: "blue",
      apiBaseUrl: "https://ca-compass-api-prd-cc-02---blue.example.com",
      webBaseUrl: "https://ca-compass-web-prd-cc-02---blue.example.com",
      apiRevision: "ca-compass-api-prd-cc-02--api-aaaaaaaaaaaaaaaaaaaaaaa",
      webRevision: "ca-compass-web-prd-cc-02--web-aaaaaaaaaaaaaaaaaaaaaaa",
      summary: "deploy=0 verify=0"
    });

    expect(document.schemaVersion).toBe("production-rehearsal-evidence.v1");
    expect(document.environment).toBe("production-rehearsal");
  });

  it("rejects invalid callback urls", () => {
    expect(() =>
      createProductionRehearsalEvidence({
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        workflowRunId: "123456",
        rehearsedAt: "2026-03-05T16:00:00Z",
        verdict: "pass",
        activeLabel: "green",
        inactiveLabel: "blue",
        apiBaseUrl: "not-a-url",
        webBaseUrl: "https://ca-compass-web-prd-cc-02---blue.example.com",
        apiRevision: "ca-compass-api-prd-cc-02--api-aaaaaaaaaaaaaaaaaaaaaaa",
        webRevision: "ca-compass-web-prd-cc-02--web-aaaaaaaaaaaaaaaaaaaaaaa",
        summary: "deploy=0 verify=0"
      })
    ).toThrow(/invalid/i);
  });
});
