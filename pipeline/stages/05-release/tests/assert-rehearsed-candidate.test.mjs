import { describe, expect, it } from "vitest";
import { assertRehearsedRevisionName } from "../scripts/assert-rehearsed-candidate.mjs";

describe("assert-rehearsed-candidate", () => {
  it("accepts the revision name derived from the candidate id", () => {
    expect(
      assertRehearsedRevisionName({
        appName: "ca-compass-api-prd-cc-02",
        appKey: "api",
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        label: "blue",
        revisionName: "ca-compass-api-prd-cc-02--api-aaaaaaaaaaaaaaaaaaaaaaaa"
      })
    ).toBe("ca-compass-api-prd-cc-02--api-aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("fails when the rehearsed revision has been superseded", () => {
    expect(() =>
      assertRehearsedRevisionName({
        appName: "ca-compass-web-prd-cc-02",
        appKey: "web",
        candidateId: "sha-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        label: "green",
        revisionName: "ca-compass-web-prd-cc-02--web-aaaaaaaaaaaaaaaaaaaaaaaaaaa"
      })
    ).toThrow(/not currently rehearsed/i);
  });
});
