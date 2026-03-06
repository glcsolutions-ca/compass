import { describe, expect, it } from "vitest";
import {
  findPassingAcceptanceAttestation,
  normalizeOciSubject
} from "../scripts/verify-acceptance-attestation.mjs";

const predicateType = "https://compass.glcsolutions.ca/pipeline/attestations/acceptance/v1";

describe("verify-acceptance-attestation", () => {
  it("normalizes plain OCI subjects", () => {
    expect(
      normalizeOciSubject(
        "ghcr.io/glcsolutions-ca/compass-release-units@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      )
    ).toBe(
      "oci://ghcr.io/glcsolutions-ca/compass-release-units@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
  });

  it("finds a matching pass attestation", () => {
    const entries = [
      {
        verificationResult: {
          statement: {
            predicateType,
            predicate: {
              schemaVersion: "acceptance-attestation.v1",
              candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              verdict: "pass"
            }
          }
        }
      }
    ];

    const predicate = findPassingAcceptanceAttestation(entries, {
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      predicateType
    });

    expect(predicate.verdict).toBe("pass");
  });

  it("fails when only fail verdict exists", () => {
    const entries = [
      {
        verificationResult: {
          statement: {
            predicateType,
            predicate: {
              schemaVersion: "acceptance-attestation.v1",
              candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              verdict: "fail"
            }
          }
        }
      }
    ];

    expect(() =>
      findPassingAcceptanceAttestation(entries, {
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        predicateType
      })
    ).toThrow(/No passing acceptance attestation found/);
  });
});
