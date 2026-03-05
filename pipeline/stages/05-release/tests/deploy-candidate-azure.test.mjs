import { describe, expect, it } from "vitest";
import {
  buildBlueGreenSlotEnv,
  expectedCandidateRevisionName,
  toRevisionSuffix
} from "../../../shared/scripts/azure/deploy-candidate-azure.mjs";

describe("deploy-candidate-azure revision naming", () => {
  it("keeps full revision name within ACA max length", () => {
    const appName = "ca-compass-api-prd-cc-02";
    const candidateId = "sha-81696acba37add74cb359dfb17bc682ce1e0ba5c";
    const suffix = toRevisionSuffix(candidateId, "api", appName);
    const fullRevisionName = `${appName}--${suffix}`;

    expect(fullRevisionName.length).toBeLessThanOrEqual(54);
    expect(suffix).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/u);
  });

  it("derives the expected revision name for a candidate", () => {
    expect(
      expectedCandidateRevisionName(
        "ca-compass-web-prd-cc-02",
        "web",
        "sha-2222222222222222222222222222222222222222"
      )
    ).toBe("ca-compass-web-prd-cc-02--web-222222222222222222222222");
  });
});

describe("deploy-candidate-azure blue/green slot env", () => {
  it("does not mutate API env for rehearsal", () => {
    expect(
      buildBlueGreenSlotEnv({
        appKey: "api",
        inactiveApiBaseUrl: "https://api-slot.example.com"
      })
    ).toEqual([]);
  });

  it("only sets API_BASE_URL for rehearsal web slot routing", () => {
    expect(
      buildBlueGreenSlotEnv({
        appKey: "web",
        inactiveApiBaseUrl: "https://api-slot.example.com"
      })
    ).toEqual(["API_BASE_URL=https://api-slot.example.com"]);
  });
});
