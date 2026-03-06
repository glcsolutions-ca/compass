import { describe, expect, it } from "vitest";
import {
  findPassingAttestation,
  normalizeOciSubject
} from "../scripts/verify-passing-attestation.mjs";

const acceptancePredicateType = "https://compass.glcsolutions.ca/pipeline/attestations/acceptance/v1";
const releasePredicateType = "https://compass.glcsolutions.ca/pipeline/attestations/release/v2";

describe("verify-passing-attestation", () => {
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
            predicateType: acceptancePredicateType,
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

    const predicate = findPassingAttestation(entries, {
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      predicateType: acceptancePredicateType
    });

    expect(predicate.verdict).toBe("pass");
  });

  it("matches release attestations too", () => {
    const entries = [
      {
        verificationResult: {
          statement: {
            predicateType: releasePredicateType,
            predicate: {
              schemaVersion: "release-attestation.v2",
              candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              verdict: "pass"
            }
          }
        }
      }
    ];

    const predicate = findPassingAttestation(entries, {
      candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      predicateType: releasePredicateType
    });

    expect(predicate.verdict).toBe("pass");
  });

  it("fails when only fail verdict exists", () => {
    const entries = [
      {
        verificationResult: {
          statement: {
            predicateType: acceptancePredicateType,
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
      findPassingAttestation(entries, {
        candidateId: "sha-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        predicateType: acceptancePredicateType
      })
    ).toThrow(/No passing attestation found/);
  });
});
