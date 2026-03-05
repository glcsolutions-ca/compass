import { describe, expect, it } from "vitest";
import { toRevisionSuffix } from "../../../shared/scripts/azure/deploy-candidate-azure.mjs";

describe("deploy-candidate-azure revision suffix", () => {
  it("keeps full revision name within ACA max length", () => {
    const appName = "ca-compass-api-prd-cc-02";
    const candidateId = "sha-81696acba37add74cb359dfb17bc682ce1e0ba5c";
    const suffix = toRevisionSuffix(candidateId, "api", appName);
    const fullRevisionName = `${appName}--${suffix}`;

    expect(fullRevisionName.length).toBeLessThanOrEqual(54);
    expect(suffix).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/u);
  });

  it("produces stable, different suffixes for different candidates", () => {
    const appName = "ca-compass-web-prd-cc-02";
    const first = toRevisionSuffix(
      "sha-1111111111111111111111111111111111111111",
      "web",
      appName
    );
    const second = toRevisionSuffix(
      "sha-2222222222222222222222222222222222222222",
      "web",
      appName
    );

    expect(first).not.toBe(second);
  });
});
